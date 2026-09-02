'use client';

import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { clearCachedToken, neon } from '@/lib/neon-client';
import { Button } from '@/components/ui/button';

export function SignOutButton() {
  const [pending, setPending] = useState(false);

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      data-testid="sign-out"
      onClick={async () => {
        setPending(true);
        await neon.auth.signOut();
        clearCachedToken();
        window.location.assign('/sign-in');
      }}
    >
      <LogOut className="size-4" />
      {pending ? 'Signing out…' : 'Sign out'}
    </Button>
  );
}
