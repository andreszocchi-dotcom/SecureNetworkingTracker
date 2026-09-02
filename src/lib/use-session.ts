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

    void (async () => {
      try {
        const { data } = await neon.auth.getSession();
        const user = (data as { user?: SessionUser } | null)?.user;
        if (!active) return;
        setState(user ? { status: 'signed-in', user } : { status: 'signed-out' });
      } catch {
        if (active) setState({ status: 'signed-out' });
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return state;
}
