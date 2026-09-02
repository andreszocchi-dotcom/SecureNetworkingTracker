/**
 * Builds a Neon Data API client bound to the *calling user's* verified token.
 *
 * This is deliberately unprivileged: there is no service key and no DATABASE_URL here. Every
 * query it issues runs as the `authenticated` role carrying that user's JWT, so the RLS policies
 * in db/schema.sql decide which rows it can touch. Note that nothing below filters by user — on
 * purpose. There is no ownership filter to forget, because the database applies it.
 */
import 'server-only';
import { createClient } from '@neondatabase/neon-js';
import { verifyCaller } from './session';

const DATA_API_URL = process.env.NEXT_PUBLIC_NEON_DATA_API_URL;

function createDataApiClient(token: string) {
  if (!DATA_API_URL) {
    throw new Error(
      'Missing NEXT_PUBLIC_NEON_DATA_API_URL. Copy .env.example to .env.local and fill it in.',
    );
  }

  // The external-auth-provider form of createClient: no auth client is created, and getToken is
  // called lazily on every request so the caller's JWT rides along on each query.
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
 * Guard at the top of every write route: verify the bearer token, then hand back a Data API
 * client that acts as that user and nobody else.
 */
export async function getAuthedContext(request: Request): Promise<AuthedContext> {
  const caller = await verifyCaller(request);
  if (!caller) return { ok: false };

  return {
    ok: true,
    client: createDataApiClient(caller.token),
    userId: caller.userId,
  };
}
