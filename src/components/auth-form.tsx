'use client';

/**
 * Sign in and sign up, sharing one form. Both call Managed Better Auth through this app's
 * /api/auth handler, which sets the signed HTTP-only session cookie.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Mode = 'sign-in' | 'sign-up';

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const result =
        mode === 'sign-up'
          ? await authClient.signUp.email({ email, password, name: name || email })
          : await authClient.signIn.email({ email, password });

      if (result.error) {
        setError(messageFor(result.error, mode));
        return;
      }

      // Full navigation so the server re-reads the new session cookie.
      router.push('/contacts');
      router.refresh();
    } catch {
      setError('Could not reach the sign-in service. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm sm:p-8">
      <h1 className="text-xl font-semibold tracking-tight">
        {mode === 'sign-in' ? 'Sign in' : 'Create an account'}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {mode === 'sign-in'
          ? 'Your contacts are private to your account.'
          : 'Takes a few seconds. No email verification needed.'}
      </p>

      <form onSubmit={handleSubmit} className="mt-6 grid gap-4" noValidate>
        {mode === 'sign-up' ? (
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Andres Zocchi"
              autoComplete="name"
            />
          </div>
        ) : null}

        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@berkeley.edu"
            autoComplete="email"
            data-testid="email"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 8 characters"
            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            data-testid="password"
          />
        </div>

        {error ? (
          <p
            role="alert"
            data-testid="auth-error"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={pending} data-testid="submit-auth">
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {mode === 'sign-in' ? 'Sign in' : 'Sign up'}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        {mode === 'sign-in' ? "Don't have an account?" : 'Already have an account?'}{' '}
        <button
          type="button"
          data-testid="toggle-mode"
          className="font-medium text-foreground underline underline-offset-4"
          onClick={() => {
            setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
            setError(null);
          }}
        >
          {mode === 'sign-in' ? 'Sign up' : 'Sign in'}
        </button>
      </p>
    </div>
  );
}

/** Turns an auth error into something a person can act on. */
function messageFor(error: { message?: string; status?: number }, mode: Mode): string {
  const raw = error.message ?? '';

  if (/password/i.test(raw) && /short|least|8/i.test(raw)) {
    return 'Password must be at least 8 characters.';
  }
  if (/already|exists|taken/i.test(raw)) {
    return 'An account with that email already exists. Try signing in instead.';
  }
  if (/invalid|credential|incorrect/i.test(raw) || error.status === 401) {
    return 'That email and password do not match an account.';
  }
  if (/email/i.test(raw) && /valid/i.test(raw)) {
    return 'Enter a valid email address.';
  }

  return raw || (mode === 'sign-in' ? 'Could not sign you in.' : 'Could not create that account.');
}
