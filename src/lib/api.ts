/**
 * Typed wrappers around the backend routes.
 *
 * The browser only ever talks to this app's own /api/contacts endpoints. It has no database URL
 * and no Data API token of its own; the server attaches the caller's JWT.
 */
import type { Contact, ContactDraft, ListOptions } from './types';

export type FieldErrors = Record<string, string>;

/** Thrown for any non-2xx response, carrying the per-field messages the backend produced. */
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

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.');
  }

  if (response.status === 204) return undefined as T;

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      (body as { error?: string })?.error ?? 'Something went wrong. Please try again.',
      (body as { fields?: FieldErrors })?.fields ?? {},
    );
  }

  return body as T;
}

export function listContacts(options: ListOptions, signal?: AbortSignal): Promise<{ contacts: Contact[] }> {
  const params = new URLSearchParams({ sort: options.sort, direction: options.direction });
  if (options.priority !== 'all') params.set('priority', options.priority);
  if (options.search.trim()) params.set('search', options.search.trim());

  return request<{ contacts: Contact[] }>(`/api/contacts?${params}`, { signal });
}

export function createContact(draft: ContactDraft): Promise<{ contact: Contact }> {
  return request<{ contact: Contact }>('/api/contacts', {
    method: 'POST',
    body: JSON.stringify(draft),
  });
}

export function updateContact(id: string, draft: ContactDraft): Promise<{ contact: Contact }> {
  return request<{ contact: Contact }>(`/api/contacts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(draft),
  });
}

export function deleteContact(id: string): Promise<void> {
  return request<void>(`/api/contacts/${id}`, { method: 'DELETE' });
}
