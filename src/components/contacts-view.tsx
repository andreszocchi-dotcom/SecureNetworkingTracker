'use client';

/**
 * The contacts screen. Owns the list state and the four explicit UI states the brief asks for:
 * loading (skeleton rows), empty (a prompt to add the first contact), success (toasts and the
 * rendered list), and error (an inline panel with a retry, plus per-field messages in the form).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Search, TriangleAlert, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError, createContact, deleteContact, listContacts, updateContact } from '@/lib/api';
import type { FieldErrors } from '@/lib/api';
import {
  type Contact,
  type ContactDraft,
  type ListOptions,
  type Priority,
  type SortColumn,
  draftFromContact,
} from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ContactFormDialog } from '@/components/contact-form-dialog';
import { ContactList } from '@/components/contact-list';

type Status = 'loading' | 'ready' | 'error';

const DEFAULT_OPTIONS: ListOptions = {
  sort: 'created_at',
  direction: 'desc',
  priority: 'all',
  search: '',
};

export function ContactsView() {
  const [options, setOptions] = useState<ListOptions>(DEFAULT_OPTIONS);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);

  // True only once the first load lands, so we can tell "no contacts yet" from "no matches".
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [hasAnyContacts, setHasAnyContacts] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState<Contact | null>(null);
  const [pending, setPending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const requestId = useRef(0);

  const load = useCallback(async (next: ListOptions) => {
    const id = ++requestId.current;
    setStatus('loading');
    setLoadError(null);

    try {
      const { contacts: rows } = await listContacts(next);
      if (id !== requestId.current) return; // A newer request already won.

      setContacts(rows);
      setStatus('ready');
      setHasLoadedOnce(true);

      // Only an unfiltered view can tell us whether the account is genuinely empty.
      if (next.priority === 'all' && next.search.trim() === '') {
        setHasAnyContacts(rows.length > 0);
      } else if (rows.length > 0) {
        setHasAnyContacts(true);
      }
    } catch (error) {
      if (id !== requestId.current) return;
      setStatus('error');
      setLoadError(error instanceof ApiError ? error.message : 'Could not load your contacts.');
    }
  }, []);

  // Debounce the search box; other option changes fire immediately.
  useEffect(() => {
    const delay = options.search ? 250 : 0;
    const timer = setTimeout(() => void load(options), delay);
    return () => clearTimeout(timer);
  }, [options, load]);

  function resetFormErrors() {
    setFieldErrors({});
    setFormError(null);
  }

  function handleApiError(error: unknown, fallback: string) {
    if (error instanceof ApiError) {
      setFieldErrors(error.fields);
      setFormError(error.message);
      // 401 means the session expired underneath us; send the user back to sign in.
      if (error.status === 401) {
        toast.error('Your session expired. Please sign in again.');
        window.location.href = '/sign-in';
        return;
      }
      toast.error(error.message);
      return;
    }
    setFormError(fallback);
    toast.error(fallback);
  }

  async function handleCreate(draft: ContactDraft) {
    setPending(true);
    resetFormErrors();
    try {
      await createContact(draft);
      setAddOpen(false);
      toast.success(`${draft.name.trim() || 'Contact'} added.`);
      setHasAnyContacts(true);
      await load(options);
    } catch (error) {
      handleApiError(error, 'Could not add that contact.');
    } finally {
      setPending(false);
    }
  }

  async function handleUpdate(draft: ContactDraft) {
    if (!editing) return;
    setPending(true);
    resetFormErrors();
    try {
      await updateContact(editing.id, draft);
      setEditing(null);
      toast.success('Contact updated.');
      await load(options);
    } catch (error) {
      handleApiError(error, 'Could not save those changes.');
    } finally {
      setPending(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setBusyId(deleting.id);
    try {
      await deleteContact(deleting.id);
      toast.success(`${deleting.name} deleted.`);
      setDeleting(null);
      await load(options);
    } catch (error) {
      handleApiError(error, 'Could not delete that contact.');
    } finally {
      setBusyId(null);
    }
  }

  function toggleSort(column: SortColumn) {
    setOptions((current) => ({
      ...current,
      sort: column,
      direction: current.sort === column && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  }

  const filtersActive = options.priority !== 'all' || options.search.trim() !== '';

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your network</h1>
          <p className="text-sm text-muted-foreground">
            {status === 'ready'
              ? `${contacts.length} ${contacts.length === 1 ? 'contact' : 'contacts'}${
                  filtersActive ? ' matching your filters' : ''
                }`
              : 'People you want to stay connected with at Berkeley.'}
          </p>
        </div>
        <Button
          onClick={() => {
            resetFormErrors();
            setAddOpen(true);
          }}
          data-testid="add-contact"
        >
          <Plus className="size-4" />
          Add contact
        </Button>
      </div>

      {/* Filter + sort controls */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={options.search}
            onChange={(event) =>
              setOptions((current) => ({ ...current, search: event.target.value }))
            }
            placeholder="Search name or company"
            aria-label="Search contacts by name or company"
            data-testid="search"
            className="pl-9"
          />
        </div>

        <Select
          value={options.priority}
          onValueChange={(value) =>
            setOptions((current) => ({ ...current, priority: value as Priority | 'all' }))
          }
        >
          <SelectTrigger
            className="sm:w-44"
            aria-label="Filter by priority"
            data-testid="filter-priority"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="high">High only</SelectItem>
            <SelectItem value="medium">Medium only</SelectItem>
            <SelectItem value="low">Low only</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={`${options.sort}:${options.direction}`}
          onValueChange={(value) => {
            const [sort, direction] = value.split(':') as [SortColumn, 'asc' | 'desc'];
            setOptions((current) => ({ ...current, sort, direction }));
          }}
        >
          <SelectTrigger className="sm:w-52" aria-label="Sort contacts" data-testid="sort-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="created_at:desc">Newest first</SelectItem>
            <SelectItem value="created_at:asc">Oldest first</SelectItem>
            <SelectItem value="name:asc">Name A–Z</SelectItem>
            <SelectItem value="name:desc">Name Z–A</SelectItem>
            <SelectItem value="company:asc">Company A–Z</SelectItem>
            <SelectItem value="priority:asc">Priority high → low</SelectItem>
            <SelectItem value="priority:desc">Priority low → high</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* --- state: error --- */}
      {status === 'error' ? (
        <div
          role="alert"
          data-testid="load-error"
          className="grid gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-center"
        >
          <TriangleAlert className="mx-auto size-6 text-destructive" />
          <p className="font-medium">{loadError}</p>
          <div>
            <Button variant="outline" onClick={() => void load(options)}>
              Try again
            </Button>
          </div>
        </div>
      ) : null}

      {/* --- state: loading --- */}
      {status === 'loading' && !hasLoadedOnce ? (
        <div className="grid gap-3" data-testid="loading">
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex items-center gap-4 rounded-lg border p-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="ml-auto h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      ) : null}

      {/* --- state: empty --- */}
      {status === 'ready' && contacts.length === 0 ? (
        <div
          data-testid="empty-state"
          className="grid gap-3 rounded-lg border border-dashed p-10 text-center"
        >
          <UserPlus className="mx-auto size-7 text-muted-foreground" />
          {hasAnyContacts || filtersActive ? (
            <>
              <p className="font-medium">No contacts match those filters.</p>
              <p className="text-sm text-muted-foreground">
                Try a different search term or priority.
              </p>
              <div>
                <Button variant="outline" onClick={() => setOptions(DEFAULT_OPTIONS)}>
                  Clear filters
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="font-medium">No contacts yet.</p>
              <p className="text-sm text-muted-foreground">
                Add the first person you want to stay in touch with.
              </p>
              <div>
                <Button
                  onClick={() => {
                    resetFormErrors();
                    setAddOpen(true);
                  }}
                >
                  <Plus className="size-4" />
                  Add your first contact
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}

      {/* --- state: success --- */}
      {contacts.length > 0 ? (
        <div className={status === 'loading' ? 'opacity-60 transition-opacity' : undefined}>
          <ContactList
            contacts={contacts}
            sort={options.sort}
            direction={options.direction}
            onSortChange={toggleSort}
            onEdit={(contact) => {
              resetFormErrors();
              setEditing(contact);
            }}
            onDelete={setDeleting}
            busyId={busyId}
          />
        </div>
      ) : null}

      <ContactFormDialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) resetFormErrors();
        }}
        title="Add a contact"
        description="Everything except the name is optional."
        submitLabel="Add contact"
        pending={pending}
        fieldErrors={fieldErrors}
        formError={formError}
        onSubmit={handleCreate}
      />

      <ContactFormDialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
            resetFormErrors();
          }
        }}
        initial={editing ? draftFromContact(editing) : undefined}
        title="Edit contact"
        description="Update what you know about this person."
        submitLabel="Save changes"
        pending={pending}
        fieldErrors={fieldErrors}
        formError={formError}
        onSubmit={handleUpdate}
      />

      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {deleting?.name}?</DialogTitle>
            <DialogDescription>
              This removes the contact from your list. It cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={busyId !== null}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={busyId !== null}
              data-testid="confirm-delete"
            >
              {busyId ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
