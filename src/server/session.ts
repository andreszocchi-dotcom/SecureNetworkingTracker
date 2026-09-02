/**
 * Server-side verification of the caller's JWT.
 *
 * Write requests arrive with `Authorization: Bearer <jwt>`. The backend does not take that token
 * on trust: it verifies the signature against Managed Better Auth's public JWKS before doing
 * anything with it. NEON_AUTH_BASE_URL is a server-only variable, so the address the backend
 * trusts for keys is not something a client can influence.
 *
 * Postgres verifies the same token again when the Data API forwards it. Two independent checks:
 * this one so the backend knows who it is validating for, and the database's own so that a bug
 * here still cannot expose another user's rows.
 */
import 'server-only';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const BASE_URL = process.env.NEON_AUTH_BASE_URL;

/**
 * Managed Better Auth publishes its public keys at
 * `<auth base url>/.well-known/jwks.json` — the same `jwks_url` the Neon API reports for the
 * project's auth integration.
 */
function jwksUrl(): URL {
  if (!BASE_URL) {
    throw new Error(
      'Missing NEON_AUTH_BASE_URL. Copy .env.example to .env.local and fill it in.',
    );
  }
  const base = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
  return new URL('.well-known/jwks.json', base);
}

// createRemoteJWKSet caches the keys and refreshes them on rotation, so this is not a fetch per
// request.
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  jwks ??= createRemoteJWKSet(jwksUrl());
  return jwks;
}

export type VerifiedCaller = { userId: string; token: string };

/** Pulls the bearer token off the request and verifies it. Returns null if anything is off. */
export async function verifyCaller(request: Request): Promise<VerifiedCaller | null> {
  const header = request.headers.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;

  try {
    const { payload } = await jwtVerify(token, getJwks());
    // `sub` is the claim Postgres exposes as auth.user_id() inside the RLS policies, so the user
    // this backend thinks it is acting for is the same one the database will scope rows to.
    const userId = payload.sub;
    if (typeof userId !== 'string' || userId.length === 0) return null;

    return { userId, token };
  } catch (error) {
    console.warn('[contacts] rejected a token:', (error as Error).message);
    return null;
  }
}
