/** Small helpers so every route handler returns the same JSON error shape. */
import 'server-only';
import { NextResponse } from 'next/server';
import type { FieldErrors } from './contact-schema';

export type ApiError = { error: string; fields?: FieldErrors };

export function jsonError(status: number, error: string, fields?: FieldErrors) {
  return NextResponse.json<ApiError>({ error, ...(fields ? { fields } : {}) }, { status });
}

export const unauthorized = () =>
  jsonError(401, 'You need to be signed in to do that.');

export const notFound = () =>
  jsonError(404, 'That contact does not exist, or it is not yours.');

/**
 * Turns a Data API error into a safe, human-readable message.
 *
 * Two things matter here. First, the raw driver message is logged but never returned, so database
 * internals do not leak to the browser. Second, a violated CHECK constraint is reported as a 400
 * with a friendly message: the database is the last line of validation, and when it fires the user
 * should still see something useful rather than a generic 500.
 */
export function dataApiError(context: string, error: { message?: string; code?: string } | null) {
  console.error(`[contacts] ${context}:`, error?.code, error?.message);

  const message = error?.message ?? '';

  if (message.includes('contacts_name_not_blank')) {
    return jsonError(400, 'Name is required.', { name: 'Name is required.' });
  }
  if (message.includes('contacts_priority_valid')) {
    return jsonError(400, 'Priority must be one of: high, medium, low.', {
      priority: 'Priority must be one of: high, medium, low.',
    });
  }
  if (message.includes('_len')) {
    return jsonError(400, 'One of those fields is too long.');
  }
  // A row-level security denial surfaces as a permission error rather than a leak of the row.
  if (error?.code === '42501' || message.toLowerCase().includes('row-level security')) {
    return jsonError(403, 'You can only change your own contacts.');
  }

  return jsonError(500, 'Something went wrong saving that. Please try again.');
}

/** Reads and parses a JSON body without throwing on malformed input. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
