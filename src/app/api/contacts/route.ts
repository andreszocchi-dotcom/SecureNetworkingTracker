/**
 * Backend: create a contact.
 *
 *   POST /api/contacts
 *
 * Reads are not here. The browser lists contacts by querying the Data API directly, which is safe
 * because RLS scopes what it can see. Writes are routed through this server so that a trusted
 * layer validates them before they reach the database, and so that the error messages a user
 * sees are written for people rather than being raw constraint violations.
 *
 * verify token -> validate input -> write as that user.
 */
import { NextResponse } from 'next/server';
import { getAuthedContext } from '@/server/data-api';
import { parseContactCreate } from '@/server/contact-schema';
import { dataApiError, jsonError, readJson, unauthorized } from '@/server/http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const ctx = await getAuthedContext(request);
  if (!ctx.ok) return unauthorized();

  const parsed = parseContactCreate(await readJson(request));
  if (!parsed.ok) return jsonError(400, parsed.error, parsed.fields);

  // parsed.data carries no user_id — the column default auth.user_id() assigns ownership from the
  // verified token, so a client cannot create a contact in someone else's list.
  const { data, error } = await ctx.client
    .from('contacts')
    .insert(parsed.data)
    .select('*')
    .single();

  if (error) return dataApiError('create', error);

  return NextResponse.json({ contact: data }, { status: 201 });
}
