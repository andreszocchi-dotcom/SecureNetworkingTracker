'use client';

import { RequireSession } from '@/components/require-session';
import { ContactsView } from '@/components/contacts-view';
import { SignOutButton } from '@/components/sign-out-button';

export default function ContactsPage() {
  return (
    <RequireSession>
      {(user) => (
        <div className="min-h-dvh bg-muted/30">
          <header className="border-b bg-background">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
              <div className="min-w-0">
                <p className="text-sm font-semibold">Networking Tracker</p>
                <p className="truncate text-xs text-muted-foreground" data-testid="signed-in-as">
                  {user.email}
                </p>
              </div>
              <SignOutButton />
            </div>
          </header>

          <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
            <ContactsView />
          </main>
        </div>
      )}
    </RequireSession>
  );
}
