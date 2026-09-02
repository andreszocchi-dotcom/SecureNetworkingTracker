'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { FieldErrors } from '@/lib/api';
import { type ContactDraft, type Priority, emptyDraft } from '@/lib/types';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Undefined when adding, a populated draft when editing. */
  initial?: ContactDraft;
  title: string;
  description: string;
  submitLabel: string;
  pending: boolean;
  fieldErrors: FieldErrors;
  formError: string | null;
  onSubmit: (draft: ContactDraft) => void;
};

export function ContactFormDialog({
  open,
  onOpenChange,
  initial,
  title,
  description,
  submitLabel,
  pending,
  fieldErrors,
  formError,
  onSubmit,
}: Props) {
  const [draft, setDraft] = useState<ContactDraft>(initial ?? emptyDraft);

  // Reset the fields whenever the dialog is opened for a different contact.
  useEffect(() => {
    if (open) setDraft(initial ?? emptyDraft);
  }, [open, initial]);

  const set = <K extends keyof ContactDraft>(key: K, value: ContactDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(draft);
          }}
          className="grid gap-4"
        >
          {/*
            No `required` attribute on purpose: the browser must not intercept the submit, so an
            empty name reaches the backend and the message shown below is the one the server
            produced. Validation lives on the server and in Postgres, not in the markup.
          */}
          <Field
            id="name"
            label="Name"
            error={fieldErrors.name}
            hint="The only field we insist on."
          >
            <Input
              id="name"
              value={draft.name}
              onChange={(event) => set('name', event.target.value)}
              placeholder="Priya Raman"
              aria-invalid={Boolean(fieldErrors.name)}
              autoFocus
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="company" label="Company" error={fieldErrors.company}>
              <Input
                id="company"
                value={draft.company}
                onChange={(event) => set('company', event.target.value)}
                placeholder="Anthropic"
                aria-invalid={Boolean(fieldErrors.company)}
              />
            </Field>

            <Field id="role" label="Role" error={fieldErrors.role}>
              <Input
                id="role"
                value={draft.role}
                onChange={(event) => set('role', event.target.value)}
                placeholder="Research Engineer"
                aria-invalid={Boolean(fieldErrors.role)}
              />
            </Field>
          </div>

          <Field id="met_where" label="Where you met" error={fieldErrors.met_where}>
            <Input
              id="met_where"
              value={draft.met_where}
              onChange={(event) => set('met_where', event.target.value)}
              placeholder="Berkeley AI Systems mixer"
              aria-invalid={Boolean(fieldErrors.met_where)}
            />
          </Field>

          <Field id="priority" label="Priority" error={fieldErrors.priority}>
            <Select
              value={draft.priority}
              onValueChange={(value) => set('priority', value as Priority)}
            >
              <SelectTrigger id="priority" className="w-full" aria-invalid={Boolean(fieldErrors.priority)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field id="notes" label="Notes" error={fieldErrors.notes}>
            <Textarea
              id="notes"
              value={draft.notes}
              onChange={(event) => set('notes', event.target.value)}
              placeholder="Follow up about her interpretability reading group."
              rows={3}
              aria-invalid={Boolean(fieldErrors.notes)}
            />
          </Field>

          {formError ? (
            <p
              role="alert"
              data-testid="form-error"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {formError}
            </p>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p role="alert" data-testid={`error-${id}`} className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
