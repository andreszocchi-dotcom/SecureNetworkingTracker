/**
 * Backend: single-contact routes.
 *
 *   PATCH  /api/contacts/:id   edit a contact
 *   DELETE /api/contacts/:id   delete a contact
 *
 * Both address the row by id alone. A user who guesses another user's contact id still changes
 * nothing, because the RLS USING clause removes that row from the statement's scope entirely —
 * the update matches zero rows and we answer 404.
 */
import { NextResponse } from 'next/server';
import { getAuthedContext } from '@/server/data-api';
import { parseContactUpdate } from '@/server/contact-schema';
import { dataApiError, jsonError, notFound, readJson, unauthorized } from '@/server/http';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const ctx = await getAuthedContext();
  if (!ctx.ok) return unauthorized();

  const { id } = await params;
  if (!UUID.test(id)) return notFound();

  const parsed = parseContactUpdate(await readJson(request));
  if (!parsed.ok) return jsonError(400, parsed.error, parsed.fields);

  const { data, error } = await ctx.client
    .from('contacts')
    .update(parsed.data)
    .eq('id', id)
    .select('*');

  if (error) return dataApiError('update', error);
  if (!data || data.length === 0) return notFound();

  return NextResponse.json({ contact: data[0] });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const ctx = await getAuthedContext();
  if (!ctx.ok) return unauthorized();

  const { id } = await params;
  if (!UUID.test(id)) return notFound();

  const { data, error } = await ctx.client
    .from('contacts')
    .delete()
    .eq('id', id)
    .select('id');

  if (error) return dataApiError('delete', error);
  if (!data || data.length === 0) return notFound();

  return new NextResponse(null, { status: 204 });
}
