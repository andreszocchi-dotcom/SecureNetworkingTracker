/**
 * Builds a Neon Data API client bound to the *calling user's* access token.
 *
 * This is the only place the backend talks to the database, and it is deliberately unprivileged:
 * there is no service key and no DATABASE_URL here. Every query it issues runs as the
 * `authenticated` role with that user's JWT, so the RLS policies in db/schema.sql decide which
 * rows are visible. If this file had a bug that forgot a `.eq('user_id', ...)` filter — and it
 * does not filter by user at all, on purpose — the database would still return only the caller's
 * rows.
 */
import 'server-only';
import { createClient } from '@neondatabase/neon-js';
import { auth } from './auth';

const DATA_API_URL = process.env.NEXT_PUBLIC_NEON_DATA_API_URL;

/**
 * Exchanges the verified session cookie for the JWT the Data API accepts.
 *
 * `auth.token()` hits Better Auth's /token endpoint, which mints a short-lived JWT for the
 * current session — that is the credential the Data API verifies and whose `sub` claim becomes
 * auth.user_id() inside the RLS policies. (Not to be confused with `auth.getAccessToken()`,
 * which returns a linked OAuth provider's token and is unrelated.)
 *
 * The token is fetched per request and never cached across users.
 */
async function getDataApiToken(): Promise<string | null> {
  const { data, error } = await auth.token();
  if (error) {
    console.error('[contacts] could not mint a Data API token:', error.message);
    return null;
  }

  // The SDK is beta; accept the documented key and the obvious alternatives rather than
  // depending on one name.
  const payload = data as Record<string, unknown> | null;
  const token = payload?.token ?? payload?.accessToken ?? payload?.access_token ?? payload?.jwt;

  return typeof token === 'string' && token.length > 0 ? token : null;
}

export type DataApiClient = ReturnType<typeof createDataApiClient>;

function createDataApiClient(token: string) {
  if (!DATA_API_URL) {
    throw new Error(
      'Missing NEXT_PUBLIC_NEON_DATA_API_URL. Copy .env.example to .env.local and fill it in.',
    );
  }

  // The external-auth-provider form of createClient: no auth client is created, and getToken is
  // called lazily for every request so the caller's JWT rides along on each query.
  return createClient({
    dataApi: {
      url: DATA_API_URL,
      getToken: async () => token,
    },
  });
}

export type AuthedContext =
  | { ok: true; client: ReturnType<typeof createDataApiClient>; userId: string }
  | { ok: false };

/**
 * Guard used at the top of every contacts route handler. Returns a Data API client scoped to the
 * signed-in user, or `{ ok: false }` when there is no valid session.
 */
export async function getAuthedContext(): Promise<AuthedContext> {
  const { data } = await auth.getSession();
  const userId = (data as { user?: { id?: string } } | null)?.user?.id;
  if (!userId) return { ok: false };

  const token = await getDataApiToken();
  if (!token) return { ok: false };

  return { ok: true, client: createDataApiClient(token), userId };
}
