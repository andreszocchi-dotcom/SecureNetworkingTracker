'use client';

/**
 * Routing guard for the signed-in area.
 *
 * This is convenience, not security. Even if someone skipped it, the Data API would refuse an
 * unauthenticated query and RLS would scope any authenticated one to its own owner — so the page
 * would render, and show nothing.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useSession, type SessionUser } from '@/lib/use-session';

export function RequireSession({
  children,
}: {
  children: (user: SessionUser) => React.ReactNode;
}) {
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session.status === 'signed-out') router.replace('/sign-in');
  }, [session.status, router]);

  if (session.status === 'signed-in') return <>{children(session.user)}</>;

  return (
    <div className="flex min-h-dvh items-center justify-center" data-testid="session-loading">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
      <span className="sr-only">Checking your session…</span>
    </div>
  );
}
