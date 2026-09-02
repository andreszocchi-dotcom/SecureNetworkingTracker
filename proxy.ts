/**
 * Route protection. Next.js 16 calls this file `proxy.ts` (it was `middleware.ts` before).
 *
 * This is a convenience redirect for signed-out visitors, not a security control: the real
 * protection is that every /api/contacts handler re-checks the session and that Postgres RLS
 * scopes rows to the token's owner.
 */
import type { NextRequest } from 'next/server';
import { auth } from '@/server/auth';

const authMiddleware = auth.middleware({ loginUrl: '/sign-in' });

export default function proxy(request: NextRequest) {
  if (request.headers.has('Next-Action')) return;
  return authMiddleware(request);
}

export const config = {
  matcher: ['/contacts/:path*'],
};
