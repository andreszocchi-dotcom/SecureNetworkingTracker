/**
 * Server-side Managed Better Auth instance.
 *
 * Reads NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET, which are server-only variables — they
 * have no NEXT_PUBLIC_ prefix, so Next.js will not inline them into the browser bundle, and this
 * module is marked server-only so importing it from a client component is a build error.
 */
import 'server-only';
import { createNeonAuth } from '@neondatabase/auth/next/server';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export const auth = createNeonAuth({
  baseUrl: required('NEON_AUTH_BASE_URL'),
  cookies: {
    secret: required('NEON_AUTH_COOKIE_SECRET'),
  },
});

export type SessionUser = {
  id: string;
  email: string;
  name?: string | null;
};

/**
 * Returns the signed-in user, or null. The session cookie is read and verified by the SDK; the
 * caller never supplies a user id.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const { data } = await auth.getSession();
  const user = (data as { user?: SessionUser } | null)?.user;
  return user ?? null;
}
