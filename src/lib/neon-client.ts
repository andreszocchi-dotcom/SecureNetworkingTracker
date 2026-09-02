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
/**
 * Cached until shortly before it expires. Every read and write needs a token, and a debounced
 * search box would otherwise mint a fresh one on each keystroke. The 30-second margin means a
 * token is never handed out so close to expiry that it dies in flight.
 */
let cached: { token: string; expiresAt: number } | null = null;

function expiryOf(jwt: string): number {
  try {
    const segment = jwt.split('.')[1];
    const padded = segment + '='.repeat((4 - (segment.length % 4)) % 4);
    const claims = JSON.parse(atob(padded.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof claims.exp === 'number' ? claims.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

export async function getAccessToken(): Promise<string | null> {
  if (cached && Date.now() < cached.expiresAt - 30_000) return cached.token;

  try {
    const response = await fetch(`${AUTH_URL}/token`, { credentials: 'include' });
    if (!response.ok) {
      cached = null;
      return null;
    }

    const { token } = (await response.json()) as { token?: string };
    if (!token) {
      cached = null;
      return null;
    }

    cached = { token, expiresAt: expiryOf(token) };
    return token;
  } catch {
    cached = null;
    return null;
  }
}

/** Called on sign-out so the next visitor cannot reuse the previous session's token. */
export function clearCachedToken() {
  cached = null;
}
