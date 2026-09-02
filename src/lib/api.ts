/**
 * How the browser reads and writes contacts.
 *
 * Everything goes through this app's own backend at /api/contacts. The browser holds no database
 * credential; it forwards the short-lived JWT for its session, and the server verifies that token,
 * validates the request, and performs the query as that user so RLS still applies.
 *
 * The browser could talk to the Data API directly — the assignment allows it, and RLS would keep
 * it safe, which `npm run test:rls` proves by doing exactly that. Routing through the backend
 * instead means every read and every write passes one trusted layer: one place that validates
 * input, one place that maps database errors to messages meant for people, and one place to add
 * logging or rate limiting later.
 */
import { getAccessToken } from './neon-client';
import type { Contact, ContactDraft, ListOptions } from './types';

export type FieldErrors = Record<string, string>;

export class ApiError extends Error {
  readonly status: number;
  readonly fields: FieldErrors;

  constructor(status: number, message: string, fields: FieldErrors = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fields = fields;
  }
}

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  if (!token) {
    throw new ApiError(401, 'You need to be signed in to do that.');
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.');
  }

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      (payload as { error?: string })?.error ?? 'Something went wrong. Please try again.',
      (payload as { fields?: FieldErrors })?.fields ?? {},
    );
  }

  return payload as T;
}

export async function listContacts(
  options: ListOptions,
  signal?: AbortSignal,
): Promise<Contact[]> {
  const params = new URLSearchParams({ sort: options.sort, direction: options.direction });
  if (options.priority !== 'all') params.set('priority', options.priority);
  if (options.search.trim()) params.set('search', options.search.trim());

  const { contacts } = await call<{ contacts: Contact[] }>(`/api/contacts?${params}`, { signal });
  return contacts;
}

export function createContact(draft: ContactDraft): Promise<{ contact: Contact }> {
  return call<{ contact: Contact }>('/api/contacts', {
    method: 'POST',
    body: JSON.stringify(draft),
  });
}

export function updateContact(id: string, draft: ContactDraft): Promise<{ contact: Contact }> {
  return call<{ contact: Contact }>(`/api/contacts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(draft),
  });
}

export function deleteContact(id: string): Promise<void> {
  return call<void>(`/api/contacts/${id}`, { method: 'DELETE' });
}
