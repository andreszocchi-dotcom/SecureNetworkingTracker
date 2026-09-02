'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { neon } from '@/lib/neon-client';
import { Button } from '@/components/ui/button';

export function SignOutButton() {
  const router = useRouter();
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
        router.replace('/sign-in');
      }}
    >
      <LogOut className="size-4" />
      {pending ? 'Signing out…' : 'Sign out'}
    </Button>
  );
}
