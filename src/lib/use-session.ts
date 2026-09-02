'use client';

/**
 * Tracks the signed-in user in the browser.
 *
 * The session lives with the Better Auth client rather than in a cookie this app controls, so the
 * check happens on the client. That is a routing convenience only: the actual protection is that
 * the Data API rejects an unauthenticated request and RLS scopes every row to its owner, so
 * skipping this check would still reveal nothing.
 */
import { useEffect, useState } from 'react';
import { neon } from './neon-client';

export type SessionUser = {
  id: string;
  email: string;
  name?: string | null;
};

export type SessionState =
  | { status: 'loading' }
  | { status: 'signed-in'; user: SessionUser }
  | { status: 'signed-out' };

export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  useEffect(() => {
    let active = true;

    async function read(): Promise<SessionUser | null> {
      try {
        const { data } = await neon.auth.getSession();
        return (data as { user?: SessionUser } | null)?.user ?? null;
      } catch {
        return null;
      }
    }

    void (async () => {
      let user = await read();

      // Straight after sign-in the session cookie can still be in flight, and concluding
      // "signed out" too early bounces the user back to /sign-in — which then sees a valid
      // session and bounces them forward again. One retry settles it.
      if (!user) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        if (!active) return;
        user = await read();
      }

      if (!active) return;
      setState(user ? { status: 'signed-in', user } : { status: 'signed-out' });
    })();

    return () => {
      active = false;
    };
  }, []);

  return state;
}
