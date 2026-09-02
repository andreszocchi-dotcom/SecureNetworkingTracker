'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthForm } from '@/components/auth-form';
import { useSession } from '@/lib/use-session';

export default function SignInPage() {
  const session = useSession();
  const router = useRouter();

  // Already signed in? Skip the form.
  useEffect(() => {
    if (session.status === 'signed-in') router.replace('/contacts');
  }, [session.status, router]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-12">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Networking Tracker</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Keep track of the people you meet at Berkeley.
        </p>
      </div>
      <AuthForm />
    </main>
  );
}
