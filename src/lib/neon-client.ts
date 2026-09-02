'use client';

/**
 * The browser's Neon client, built with the two-URL object form: one URL for Managed Better Auth
 * and one for the Data API.
 *
 * Both URLs are public HTTPS endpoints, not credentials. The client uses them to sign users in
 * and to read contacts straight from Postgres over the Data API, attaching the signed-in user's
 * JWT to every query. What keeps one user's rows away from another is Row Level Security in the
 * database — see db/schema.sql — not anything in this file.
 */
import { createClient } from '@neondatabase/neon-js';

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing ${name}. Copy .env.example to .env.local and fill it in.`);
  }
  return value;
}

export const neon = createClient({
  auth: {
    url: required('NEXT_PUBLIC_NEON_AUTH_URL', process.env.NEXT_PUBLIC_NEON_AUTH_URL),
  },
  dataApi: {
    url: required('NEXT_PUBLIC_NEON_DATA_API_URL', process.env.NEXT_PUBLIC_NEON_DATA_API_URL),
  },
});

/**
 * The JWT for the current session.
 *
 * Reads go directly to the Data API and the client attaches this automatically. Writes go through
 * this app's backend instead, so that a server can validate them, and the backend needs the token
 * to (a) verify who is asking and (b) perform the write as that user so RLS still applies.
 */
export async function getAccessToken(): Promise<string | null> {
  const { data, error } = await neon.auth.token();
  if (error) return null;

  const payload = data as Record<string, unknown> | null;
  const token = payload?.token ?? payload?.accessToken ?? payload?.access_token ?? payload?.jwt;

  return typeof token === 'string' && token.length > 0 ? token : null;
}
