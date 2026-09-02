'use client';

/**
 * Sign in and sign up, sharing one form. Both call Managed Better Auth directly through the
 * neon-js client, using the public Auth URL.
 */
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { neon } from '@/lib/neon-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Mode = 'sign-in' | 'sign-up';

export function AuthForm() {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);

  async function handleGoogle() {
    setGooglePending(true);
    setError(null);

    try {
      // Hands off to Google and comes back to /contacts. The origin has to be one of Managed
      // Better Auth's trusted domains, the same allowlist that guards email sign-in.
      await neon.auth.signIn.social({
        provider: 'google',
        callbackURL: `${window.location.origin}/contacts`,
      });
    } catch {
      setError('Could not reach Google sign-in. Try again, or use an email and password.');
      setGooglePending(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const result =
        mode === 'sign-up'
          ? await neon.auth.signUp.email({ email, password, name: name || email })
          : await neon.auth.signIn.email({ email, password });

      if (result.error) {
        setError(messageFor(result.error, mode));
        return;
      }

      // A full navigation rather than a client-side push: it rebuilds the auth client from
      // scratch so the freshly set session cookie is picked up cleanly.
      window.location.assign('/contacts');
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

      <Button
        type="button"
        variant="outline"
        className="mt-6 w-full"
        onClick={handleGoogle}
        disabled={googlePending || pending}
        data-testid="google-signin"
      >
        {googlePending ? <Loader2 className="size-4 animate-spin" /> : <GoogleMark />}
        Continue with Google
      </Button>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
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

/** Google's brand mark, inline so the page pulls nothing from a third-party host. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.4 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.4a12 12 0 0 0 0 10.8l4-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.7l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z"
      />
    </svg>
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
