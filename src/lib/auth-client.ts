'use client';

/**
 * Browser-side auth client.
 *
 * It talks to this app's own /api/auth/* handler, which proxies Managed Better Auth and manages
 * the signed, HTTP-only session cookie. No Neon URL, key, or secret is needed here — nothing
 * sensitive is shipped to the browser.
 */
import { createAuthClient } from '@neondatabase/auth/next';

export const authClient = createAuthClient();
