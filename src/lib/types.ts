/** Shared shapes for the browser. Kept free of zod so the client bundle stays small. */

export const PRIORITIES = ['high', 'medium', 'low'] as const;
export type Priority = (typeof PRIORITIES)[number];

export type Contact = {
  id: string;
  user_id: string;
  name: string;
  company: string | null;
  role: string | null;
  met_where: string | null;
  notes: string | null;
  priority: Priority;
  created_at: string;
  updated_at: string;
};

export type ContactDraft = {
  name: string;
  company: string;
  role: string;
  met_where: string;
  notes: string;
  priority: Priority;
};

export const SORT_COLUMNS = ['name', 'company', 'priority', 'created_at'] as const;
export type SortColumn = (typeof SORT_COLUMNS)[number];
export type SortDirection = 'asc' | 'desc';

export type ListOptions = {
  sort: SortColumn;
  direction: SortDirection;
  priority: Priority | 'all';
  search: string;
};

export const emptyDraft: ContactDraft = {
  name: '',
  company: '',
  role: '',
  met_where: '',
  notes: '',
  priority: 'medium',
};

export function draftFromContact(contact: Contact): ContactDraft {
  return {
    name: contact.name,
    company: contact.company ?? '',
    role: contact.role ?? '',
    met_where: contact.met_where ?? '',
    notes: contact.notes ?? '',
    priority: contact.priority,
  };
}
