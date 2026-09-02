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

const AUTH_URL = required(
  'NEXT_PUBLIC_NEON_AUTH_URL',
  process.env.NEXT_PUBLIC_NEON_AUTH_URL,
).replace(/\/$/, '');

/**
 * A short-lived JWT for the current session.
 *
 * Reads do not need this — the neon-js client mints and attaches its own token for Data API
 * queries. Writes do: they go through this app's backend so a server can validate them, and the
 * backend needs the token to verify who is asking and to perform the write as that user, so RLS
 * still has the final say.
 *
 * The session itself lives in an HttpOnly cookie set by Managed Better Auth, which JavaScript
 * cannot read — hence `credentials: 'include'` rather than reading a token out of storage. This
 * is a cross-origin request, so the app's origin has to be one of Neon Auth's trusted domains.
 */
export async function getAccessToken(): Promise<string | null> {
  try {
    const response = await fetch(`${AUTH_URL}/token`, { credentials: 'include' });
    if (!response.ok) return null;

    const { token } = (await response.json()) as { token?: string };
    return token && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}
