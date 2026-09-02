/**
 * Two-account privacy proof.
 *
 * Run with:  npm run test:rls
 *
 * This test does NOT go through the Next.js backend, and it does not reuse any of the app's code.
 * It authenticates two real accounts over plain HTTP against Managed Better Auth's public
 * endpoints, exchanges each session for a JWT, and then queries the public Neon Data API as those
 * users — exactly what someone holding a valid account could do from a terminal.
 *
 * That is the point. A pass here is evidence about the database, not about the application being
 * careful: the only thing standing between User B and User A's rows is Row Level Security.
 *
 * Requires a configured .env.local (see .env.example) with both test accounts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@neondatabase/neon-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', quiet: true });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env.local and fill it in before running ` +
        'npm run test:rls.',
    );
  }
  return value;
}

const AUTH_URL = required('NEXT_PUBLIC_NEON_AUTH_URL').replace(/\/$/, '');
const DATA_API_URL = required('NEXT_PUBLIC_NEON_DATA_API_URL');

/**
 * A browser sends an Origin header on every request and Managed Better Auth requires one, so the
 * test supplies it. It has to be an origin Neon Auth trusts.
 */
const ORIGIN = process.env.RLS_TEST_ORIGIN || 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Raw auth handshake
// ---------------------------------------------------------------------------

type Account = {
  email: string;
  userId: string;
  /** The JWT the Data API verifies. Its `sub` claim becomes auth.user_id() in the RLS policies. */
  jwt: string;
};

function authHeaders(extra: Record<string, string> = {}) {
  return { Origin: ORIGIN, 'Content-Type': 'application/json', ...extra };
}

/** Node keeps no cookie jar, so collect the session cookie by hand. */
function cookiesFrom(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((line) => line.split(';')[0])
    .join('; ');
}

function decodeClaims(jwt: string): Record<string, unknown> {
  const segment = jwt.split('.')[1];
  const padded = segment + '='.repeat((4 - (segment.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded, 'base64url').toString('utf8'));
}

async function authenticate(email: string, password: string, name: string): Promise<Account> {
  // Create the account if this is the first run. An "already exists" response is fine.
  await fetch(`${AUTH_URL}/sign-up/email`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ email, password, name }),
  }).catch(() => undefined);

  const signIn = await fetch(`${AUTH_URL}/sign-in/email`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ email, password }),
  });

  if (!signIn.ok) {
    throw new Error(`Could not sign in ${email}: ${signIn.status} ${await signIn.text()}`);
  }

  const cookie = cookiesFrom(signIn);
  if (!cookie) throw new Error(`No session cookie returned for ${email}.`);

  // Exchange the session for the short-lived JWT the Data API accepts.
  const tokenResponse = await fetch(`${AUTH_URL}/token`, {
    headers: { Origin: ORIGIN, Cookie: cookie },
  });

  if (!tokenResponse.ok) {
    throw new Error(
      `Could not mint a token for ${email}: ${tokenResponse.status} ${await tokenResponse.text()}`,
    );
  }

  const { token } = (await tokenResponse.json()) as { token?: string };
  if (!token) throw new Error(`No token returned for ${email}.`);

  const claims = decodeClaims(token);
  const userId = claims.sub;
  if (typeof userId !== 'string') throw new Error(`Token for ${email} has no sub claim.`);

  // The Data API decides the database role from this claim.
  expect(claims.role, 'the JWT should carry the authenticated role').toBe('authenticated');

  return { email, userId, jwt: token };
}

/** A Data API client that acts as exactly one user. */
function clientFor(account: Account) {
  return createClient({
    dataApi: {
      url: DATA_API_URL,
      getToken: async () => account.jwt,
    },
  });
}

/** A client with no credentials at all, standing in for an unauthenticated stranger. */
function anonymousClient() {
  return createClient({
    dataApi: { url: DATA_API_URL, getToken: async () => '' },
  });
}

// ---------------------------------------------------------------------------

const MARKER = `rls-proof-${Date.now()}`;

let accountA: Account;
let accountB: Account;
let userA: ReturnType<typeof clientFor>;
let userB: ReturnType<typeof clientFor>;
let contactIdOfA: string;

beforeAll(async () => {
  accountA = await authenticate(
    required('TEST_USER_A_EMAIL'),
    required('TEST_USER_A_PASSWORD'),
    'Test User A',
  );
  accountB = await authenticate(
    required('TEST_USER_B_EMAIL'),
    required('TEST_USER_B_PASSWORD'),
    'Test User B',
  );

  expect(accountA.userId, 'the two test accounts must be different users').not.toBe(
    accountB.userId,
  );

  userA = clientFor(accountA);
  userB = clientFor(accountB);

  // User A creates a contact. No user_id is sent — the column default auth.user_id() assigns
  // ownership from A's verified token.
  const created = await userA
    .from('contacts')
    .insert({ name: MARKER, company: 'Owned by A', priority: 'high' })
    .select('*')
    .single();

  expect(
    created.error,
    `User A should be able to create a contact: ${created.error?.message}`,
  ).toBeNull();

  contactIdOfA = (created.data as { id: string }).id;
  expect((created.data as { user_id: string }).user_id).toBe(accountA.userId);
});

afterAll(async () => {
  // Leave the database as we found it.
  if (contactIdOfA) await userA.from('contacts').delete().eq('id', contactIdOfA);
});

describe('User A owns their own row', () => {
  it('A can read the contact A created', async () => {
    const { data, error } = await userA.from('contacts').select('*').eq('id', contactIdOfA);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect((data as { name: string }[])[0].name).toBe(MARKER);
  });
});

describe('User B cannot read User A contacts', () => {
  it('B listing every contact they can see does not include A row', async () => {
    const { data, error } = await userB.from('contacts').select('*');

    expect(error).toBeNull();
    const ids = (data ?? []).map((row: { id: string }) => row.id);
    expect(ids).not.toContain(contactIdOfA);
  });

  it('B asking for A row by its exact id gets nothing back', async () => {
    const { data, error } = await userB.from('contacts').select('*').eq('id', contactIdOfA);

    // Not an error — the row simply does not exist as far as B's session is concerned.
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('every row B can see belongs to B', async () => {
    const { data } = await userB.from('contacts').select('user_id');

    for (const row of (data ?? []) as { user_id: string }[]) {
      expect(row.user_id).toBe(accountB.userId);
    }
  });
});

describe('User B cannot change or delete User A contacts', () => {
  it('B update of A row affects zero rows, and A row is untouched', async () => {
    const attempt = await userB
      .from('contacts')
      .update({ name: 'hacked by B' })
      .eq('id', contactIdOfA)
      .select('*');

    expect(attempt.data ?? []).toHaveLength(0);

    const { data } = await userA.from('contacts').select('name').eq('id', contactIdOfA);
    expect((data as { name: string }[])[0].name).toBe(MARKER);
  });

  it('B delete of A row affects zero rows, and A row still exists', async () => {
    const attempt = await userB.from('contacts').delete().eq('id', contactIdOfA).select('id');

    expect(attempt.data ?? []).toHaveLength(0);

    const { data } = await userA.from('contacts').select('id').eq('id', contactIdOfA);
    expect(data).toHaveLength(1);
  });
});

describe('Ownership cannot be forged or reassigned', () => {
  it('B cannot insert a row owned by A', async () => {
    // The INSERT policy's WITH CHECK requires auth.user_id() = user_id, so this is refused.
    const { data } = await userB
      .from('contacts')
      .insert({ name: `${MARKER}-forged`, priority: 'low', user_id: accountA.userId })
      .select('*');

    const insertedForA = (data ?? []).some(
      (row: { user_id: string }) => row.user_id === accountA.userId,
    );
    expect(insertedForA, 'B must not be able to create a row owned by A').toBe(false);

    // If the row was created as B's own instead of being refused, clean it up.
    for (const row of (data ?? []) as { id: string }[]) {
      await userB.from('contacts').delete().eq('id', row.id);
    }
  });

  it('A cannot hand their own row to B', async () => {
    // The UPDATE policy's WITH CHECK evaluates the row *after* the change, so rewriting user_id
    // fails even though A legitimately owns the row right now.
    const attempt = await userA
      .from('contacts')
      .update({ user_id: accountB.userId })
      .eq('id', contactIdOfA)
      .select('*');

    const reassigned = (attempt.data ?? []).some(
      (row: { user_id: string }) => row.user_id === accountB.userId,
    );
    expect(reassigned, 'A must not be able to reassign a row to B').toBe(false);

    const { data } = await userA.from('contacts').select('user_id').eq('id', contactIdOfA);
    expect((data as { user_id: string }[])[0].user_id).toBe(accountA.userId);
  });
});

describe('Signed-out access', () => {
  it('a caller with no token reads no contacts at all', async () => {
    const { data, error } = await anonymousClient().from('contacts').select('*');

    // Either the request is refused outright or it returns nothing. Both are acceptable; what
    // must never happen is another user's row coming back.
    if (!error) expect(data ?? []).toHaveLength(0);

    const ids = (data ?? []).map((row: { id: string }) => row.id);
    expect(ids).not.toContain(contactIdOfA);
  });
});

describe('The database rejects invalid data even without the backend', () => {
  it('a blank name is refused by the CHECK constraint', async () => {
    const { error } = await userA.from('contacts').insert({ name: '   ', priority: 'low' });

    expect(error, 'Postgres should reject a whitespace-only name').not.toBeNull();
  });

  it('an invalid priority is refused by the CHECK constraint', async () => {
    const { error } = await userA
      .from('contacts')
      .insert({ name: `${MARKER}-bad-priority`, priority: 'urgent' });

    expect(error, 'Postgres should reject a priority outside the enum').not.toBeNull();
  });
});
