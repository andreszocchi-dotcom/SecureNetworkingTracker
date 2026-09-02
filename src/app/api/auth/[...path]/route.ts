/**
 * Managed Better Auth endpoints (sign up, sign in, sign out, session, token exchange).
 * The SDK owns the whole surface; we only mount it.
 */
import { auth } from '@/server/auth';

export const { GET, POST } = auth.handler();
