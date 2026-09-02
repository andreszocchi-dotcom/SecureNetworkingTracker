'use client';

/**
 * Renders the contacts twice over: a real sortable <table> from the `md` breakpoint up, and
 * stacked cards below it. Both read the same array, so the mobile and desktop views can never
 * disagree.
 */
import { ArrowDown, ArrowUp, ChevronsUpDown, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { Contact, Priority, SortColumn, SortDirection } from '@/lib/types';

const PRIORITY_STYLES: Record<Priority, string> = {
  high: 'border-transparent bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200',
  medium: 'border-transparent bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  low: 'border-transparent bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <Badge className={cn('capitalize', PRIORITY_STYLES[priority])} variant="outline">
      {priority}
    </Badge>
  );
}

type Props = {
  contacts: Contact[];
  sort: SortColumn;
  direction: SortDirection;
  onSortChange: (column: SortColumn) => void;
  onEdit: (contact: Contact) => void;
  onDelete: (contact: Contact) => void;
  busyId: string | null;
};

const COLUMNS: { key: SortColumn; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'company', label: 'Company' },
  { key: 'priority', label: 'Priority' },
  { key: 'created_at', label: 'Added' },
];

export function ContactList({
  contacts,
  sort,
  direction,
  onSortChange,
  onEdit,
  onDelete,
  busyId,
}: Props) {
  return (
    <>
      {/* Desktop / tablet */}
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.map((column) => (
                <TableHead key={column.key} className={column.key === 'priority' ? 'w-32' : undefined}>
                  <button
                    type="button"
                    onClick={() => onSortChange(column.key)}
                    data-testid={`sort-${column.key}`}
                    aria-label={`Sort by ${column.label}`}
                    className="-ml-2 inline-flex items-center gap-1 rounded px-2 py-1 font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {column.label}
                    <SortIcon active={sort === column.key} direction={direction} />
                  </button>
                </TableHead>
              ))}
              <TableHead>Role</TableHead>
              <TableHead>Where you met</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.map((contact) => (
              <TableRow key={contact.id} data-testid="contact-row">
                <TableCell className="font-medium">
                  <span data-testid="contact-name">{contact.name}</span>
                  {contact.notes ? (
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{contact.notes}</p>
                  ) : null}
                </TableCell>
                <TableCell className="text-muted-foreground">{contact.company ?? '—'}</TableCell>
                <TableCell>
                  <PriorityBadge priority={contact.priority} />
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {formatDate(contact.created_at)}
                </TableCell>
                <TableCell className="text-muted-foreground">{contact.role ?? '—'}</TableCell>
                <TableCell className="text-muted-foreground">{contact.met_where ?? '—'}</TableCell>
                <TableCell className="text-right">
                  <RowActions
                    contact={contact}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    busy={busyId === contact.id}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile */}
      <ul className="grid gap-3 md:hidden">
        {contacts.map((contact) => (
          <li
            key={contact.id}
            data-testid="contact-card"
            className="rounded-lg border bg-card p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium" data-testid="contact-name">
                  {contact.name}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {[contact.role, contact.company].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
              <PriorityBadge priority={contact.priority} />
            </div>

            {contact.met_where ? (
              <p className="mt-2 text-sm text-muted-foreground">Met at {contact.met_where}</p>
            ) : null}
            {contact.notes ? <p className="mt-2 text-sm">{contact.notes}</p> : null}

            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Added {formatDate(contact.created_at)}
              </span>
              <RowActions
                contact={contact}
                onEdit={onEdit}
                onDelete={onDelete}
                busy={busyId === contact.id}
              />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function RowActions({
  contact,
  onEdit,
  onDelete,
  busy,
}: {
  contact: Contact;
  onEdit: (contact: Contact) => void;
  onDelete: (contact: Contact) => void;
  busy: boolean;
}) {
  return (
    <div className="flex justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onEdit(contact)}
        disabled={busy}
        aria-label={`Edit ${contact.name}`}
        data-testid="edit-contact"
      >
        <Pencil className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onDelete(contact)}
        disabled={busy}
        aria-label={`Delete ${contact.name}`}
        data-testid="delete-contact"
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

function SortIcon({ active, direction }: { active: boolean; direction: SortDirection }) {
  if (!active) return <ChevronsUpDown className="size-3.5 opacity-40" />;
  return direction === 'asc' ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
