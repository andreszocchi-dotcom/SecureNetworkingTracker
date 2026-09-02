/**
 * The validated contract for a contact.
 *
 * This runs on the server, inside the route handlers, before anything reaches the database.
 * It is the source of the user-facing error messages. The database repeats these rules as CHECK
 * constraints (see db/schema.sql) so that they still hold for a request that never goes through
 * this backend.
 */
import { z } from 'zod';

export const PRIORITIES = ['high', 'medium', 'low'] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Trims, then treats an empty string as "not provided" so blank optional inputs store as NULL. */
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer.`)
    .transform((value) => (value === '' ? null : value))
    .nullish()
    .transform((value) => value ?? null);

/**
 * Note what is absent: user_id. It is not part of the contract, so a client cannot send one.
 * `.strict()` would throw on extra keys; stripping instead means a payload containing
 * `user_id: "<someone else>"` is silently discarded rather than forwarded to the database.
 * Ownership is set by the column default `auth.user_id()` and enforced by RLS.
 */
export const contactCreateSchema = z.object({
  name: z
    .string({ error: 'Name is required.' })
    .trim()
    .min(1, 'Name is required.')
    .max(120, 'Name must be 120 characters or fewer.'),
  company: optionalText(120, 'Company'),
  role: optionalText(120, 'Role'),
  met_where: optionalText(200, 'Where you met'),
  notes: optionalText(2000, 'Notes'),
  priority: z.enum(PRIORITIES, {
    error: 'Priority must be one of: high, medium, low.',
  }),
});

/** Edits may send any subset of the fields, but each sent field faces the same rules. */
export const contactUpdateSchema = contactCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'No fields to update.' },
);

export type ContactInput = z.infer<typeof contactCreateSchema>;
export type ContactUpdateInput = z.infer<typeof contactUpdateSchema>;

/** A contact row as returned by the Data API. */
export type Contact = ContactInput & {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
};

export type FieldErrors = Record<string, string>;

/**
 * Flattens a Zod error into `{ fieldName: message }` so the UI can put each message next to the
 * input that caused it.
 */
export function toFieldErrors(error: z.ZodError): FieldErrors {
  const fields: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : 'form';
    fields[key] ??= issue.message;
  }
  return fields;
}

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fields: FieldErrors };

function parseWith<T>(schema: z.ZodType<T>, payload: unknown): ParseResult<T> {
  const result = schema.safeParse(payload);
  if (result.success) return { ok: true, data: result.data };

  const fields = toFieldErrors(result.error);
  return {
    ok: false,
    // The first field message doubles as the summary, so a toast can show something specific.
    error: Object.values(fields)[0] ?? 'That contact could not be saved.',
    fields,
  };
}

export function parseContactCreate(payload: unknown): ParseResult<ContactInput> {
  return parseWith(contactCreateSchema, payload);
}

export function parseContactUpdate(payload: unknown): ParseResult<ContactUpdateInput> {
  return parseWith(contactUpdateSchema, payload);
}

// ---------------------------------------------------------------------------
// Listing options (sort + filter), also validated rather than trusted from the query string.
// ---------------------------------------------------------------------------

export const SORT_COLUMNS = ['name', 'company', 'priority', 'created_at'] as const;
export type SortColumn = (typeof SORT_COLUMNS)[number];

export const listQuerySchema = z.object({
  sort: z.enum(SORT_COLUMNS).default('created_at'),
  direction: z.enum(['asc', 'desc']).default('desc'),
  priority: z.enum(PRIORITIES).nullish(),
  search: z.string().trim().max(120).nullish(),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

/**
 * Sort and filter inputs are whitelisted through the enums above before they are handed to the
 * Data API, so a crafted `?sort=` value cannot reach the query builder as an arbitrary column.
 */
export function parseListQuery(params: URLSearchParams): ParseResult<ListQuery> {
  return parseWith(listQuerySchema, {
    sort: params.get('sort') ?? undefined,
    direction: params.get('direction') ?? undefined,
    priority: params.get('priority') || undefined,
    search: params.get('search') || undefined,
  });
}
