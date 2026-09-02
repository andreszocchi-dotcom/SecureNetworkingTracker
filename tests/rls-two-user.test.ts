/**
 * Two-account privacy proof.
 *
 * Run with:  npm run test:rls
 *
 * This test does NOT go through the Next.js backend. It authenticates two real accounts straight
 * against Managed Better Auth and queries the public Neon Data API directly, exactly as a
 * determined user could from a browser console or curl. That is the point: it proves the
 * isolation is enforced by Postgres Row Level Security, not by the app's own code being careful.
 *
 * Requires a configured .env.local (see .env.example) with both test accounts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@neondatabase/neon-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', quiet: true });

const AUTH_URL = required('NEXT_PUBLIC_NEON_AUTH_URL');
const DATA_API_URL = required('NEXT_PUBLIC_NEON_DATA_API_URL');

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

/** A fresh client per user, so the two sessions never share a token. */
function makeClient() {
  return createClient({
    auth: { url: AUTH_URL },
    dataApi: { url: DATA_API_URL },
  });
}

type Client = ReturnType<typeof makeClient>;

/** Signs the account in, creating it the first time this suite is run. */
async function signInOrSignUp(client: Client, email: string, password: string, name: string) {
  const signIn = await client.auth.signIn.email({ email, password });
  if (!signIn.error) return;

  const signUp = await client.auth.signUp.email({ email, password, name });
  if (signUp.error) {
    throw new Error(`Could not sign in or sign up ${email}: ${signUp.error.message}`);
  }
}

// A marker unique to this run, so repeated runs never collide.
const MARKER = `rls-proof-${Date.now()}`;

let userA: Client;
let userB: Client;
let userAId: string;
let userBId: string;
let contactIdOfA: string;

beforeAll(async () => {
  userA = makeClient();
  userB = makeClient();

  await signInOrSignUp(
    userA,
    required('TEST_USER_A_EMAIL'),
    required('TEST_USER_A_PASSWORD'),
    'Test User A',
  );
  await signInOrSignUp(
    userB,
    required('TEST_USER_B_EMAIL'),
    required('TEST_USER_B_PASSWORD'),
    'Test User B',
  );

  const sessionA = await userA.auth.getSession();
  const sessionB = await userB.auth.getSession();
  userAId = sessionA.data?.user?.id as string;
  userBId = sessionB.data?.user?.id as string;

  expect(userAId, 'User A should have a session').toBeTruthy();
  expect(userBId, 'User B should have a session').toBeTruthy();
  expect(userAId, 'the two test accounts must be different users').not.toBe(userBId);

  // User A creates a contact. Note that no user_id is sent — the column default auth.user_id()
  // assigns ownership from A's verified token.
  const created = await userA
    .from('contacts')
    .insert({ name: MARKER, company: 'Owned by A', priority: 'high' })
    .select('*')
    .single();

  expect(created.error, `User A should be able to create a contact: ${created.error?.message}`)
    .toBeNull();

  contactIdOfA = (created.data as { id: string }).id;
  expect((created.data as { user_id: string }).user_id).toBe(userAId);
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
      expect(row.user_id).toBe(userBId);
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
    const { data, error } = await userB
      .from('contacts')
      .insert({ name: `${MARKER}-forged`, priority: 'low', user_id: userAId })
      .select('*');

    const insertedForA = (data ?? []).some(
      (row: { user_id: string }) => row.user_id === userAId,
    );
    expect(insertedForA, 'B must not be able to create a row owned by A').toBe(false);

    if (!error && data && data.length > 0) {
      // If the Data API silently ignored the user_id and made the row B's own, clean it up.
      await userB.from('contacts').delete().eq('id', (data as { id: string }[])[0].id);
    }
  });

  it('A cannot hand their own row to B', async () => {
    // The UPDATE policy's WITH CHECK evaluates the row *after* the change, so rewriting user_id
    // to another user fails even though A legitimately owns the row right now.
    const attempt = await userA
      .from('contacts')
      .update({ user_id: userBId })
      .eq('id', contactIdOfA)
      .select('*');

    const reassigned = (attempt.data ?? []).some(
      (row: { user_id: string }) => row.user_id === userBId,
    );
    expect(reassigned, 'A must not be able to reassign a row to B').toBe(false);

    // Confirm ownership is intact.
    const { data } = await userA.from('contacts').select('user_id').eq('id', contactIdOfA);
    expect((data as { user_id: string }[])[0].user_id).toBe(userAId);
  });
});

describe('Signed-out access', () => {
  it('a client with no session reads no contacts at all', async () => {
    const anonymous = makeClient();
    const { data, error } = await anonymous.from('contacts').select('*');

    // Either the request is rejected outright or it returns an empty set. Both are acceptable;
    // what must never happen is another user's row coming back.
    if (!error) {
      expect(data ?? []).toHaveLength(0);
    }
    const ids = (data ?? []).map((row: { id: string }) => row.id);
    expect(ids).not.toContain(contactIdOfA);
  });
});
