import { redirect } from 'next/navigation';
import { getSessionUser } from '@/server/auth';
import { AuthForm } from '@/components/auth-form';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Sign in · Networking Tracker' };

export default async function SignInPage() {
  // Already signed in? Skip the form.
  const user = await getSessionUser();
  if (user) redirect('/contacts');

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
