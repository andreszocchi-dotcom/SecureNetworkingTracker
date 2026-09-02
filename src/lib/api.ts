/**
 * How the browser reads and writes contacts.
 *
 * Reads go straight to the Neon Data API through the neon-js client, which attaches the signed-in
 * user's JWT. Row Level Security is what makes that safe to expose: the query below asks for
 * every contact, and Postgres returns only the caller's own.
 *
 * Writes go through this app's own backend instead, so a trusted server validates them first and
 * turns failures into messages meant for a person. The token is forwarded so the write still runs
 * as that user and RLS still applies.
 */
import { getAccessToken, neon } from './neon-client';
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

// ---------------------------------------------------------------------------
// Read — directly against the Data API
// ---------------------------------------------------------------------------

export async function listContacts(options: ListOptions): Promise<Contact[]> {
  let query = neon.from('contacts').select('*');

  if (options.priority !== 'all') {
    query = query.eq('priority', options.priority);
  }

  const search = options.search.trim();
  if (search) {
    // PostgREST reads , . ( ) : as syntax inside an or() filter, so the term is quoted. The two
    // characters that could break out of those quotes are dropped rather than escaped — a search
    // box has no legitimate use for them, and removing them means no typed character can change
    // the shape of the filter.
    const safe = Array.from(search)
      .filter((character) => character !== '"' && character !== String.fromCharCode(92))
      .join('');
    query = query.or(`name.ilike."*${safe}*",company.ilike."*${safe}*"`);
  }

  // Priority sorts by the generated rank column so the order is high, medium, low rather than
  // alphabetical.
  const column = options.sort === 'priority' ? 'priority_rank' : options.sort;

  const { data, error } = await query
    .order(column, { ascending: options.direction === 'asc' })
    .order('created_at', { ascending: false });

  if (error) {
    // A signed-out or expired session shows up here as an auth failure from the Data API.
    const status = /jwt|token|unauthor|expired/i.test(error.message ?? '') ? 401 : 500;
    throw new ApiError(status, 'Could not load your contacts.');
  }

  return (data ?? []) as Contact[];
}

// ---------------------------------------------------------------------------
// Writes — through this app's backend, which validates before touching the database
// ---------------------------------------------------------------------------

async function write<T>(url: string, method: string, body?: unknown): Promise<T> {
  const token = await getAccessToken();
  if (!token) {
    throw new ApiError(401, 'You need to be signed in to do that.');
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
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

export function createContact(draft: ContactDraft): Promise<{ contact: Contact }> {
  return write<{ contact: Contact }>('/api/contacts', 'POST', draft);
}

export function updateContact(id: string, draft: ContactDraft): Promise<{ contact: Contact }> {
  return write<{ contact: Contact }>(`/api/contacts/${id}`, 'PATCH', draft);
}

export function deleteContact(id: string): Promise<void> {
  return write<void>(`/api/contacts/${id}`, 'DELETE');
}
