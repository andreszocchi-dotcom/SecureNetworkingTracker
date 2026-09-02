/**
 * Backend: collection routes for contacts.
 *
 *   GET  /api/contacts   list the signed-in user's contacts, sorted and filtered
 *   POST /api/contacts   create a contact
 *
 * Every request goes session check -> validation -> Data API under the caller's own JWT.
 * Note there is no `.eq('user_id', ...)` anywhere below: ownership is enforced by the RLS
 * policies in db/schema.sql, not by this file remembering to filter.
 */
import { NextResponse } from 'next/server';
import { getAuthedContext } from '@/server/data-api';
import { parseContactCreate, parseListQuery } from '@/server/contact-schema';
import { dataApiError, jsonError, readJson, unauthorized } from '@/server/http';

export const dynamic = 'force-dynamic';

const BACKSLASH = String.fromCharCode(92);

/**
 * PostgREST treats , . ( ) : as syntax inside an or() filter, so the value has to be quoted.
 * Rather than escape the two characters that would break out of those quotes, drop them: a
 * search box has no legitimate use for a quote or a backslash, and removing them means no
 * caller-supplied character can alter the shape of the filter expression.
 */
function quoteForFilter(value: string): string {
  const safe = Array.from(value)
    .filter((character) => character !== '"' && character !== BACKSLASH)
    .join('');
  return `"${safe}"`;
}

export async function GET(request: Request) {
  const ctx = await getAuthedContext();
  if (!ctx.ok) return unauthorized();

  const parsed = parseListQuery(new URL(request.url).searchParams);
  if (!parsed.ok) return jsonError(400, parsed.error, parsed.fields);

  const { sort, direction, priority, search } = parsed.data;

  let query = ctx.client.from('contacts').select('*');

  if (priority) query = query.eq('priority', priority);

  if (search) {
    // Match the search term anywhere in the name or the company.
    const term = quoteForFilter(`*${search}*`);
    query = query.or(`name.ilike.${term},company.ilike.${term}`);
  }

  // `sort` is one of four whitelisted values, so no caller-controlled string reaches the builder.
  // Priority sorts by the generated rank column so the order is high, medium, low.
  const sortColumn = sort === 'priority' ? 'priority_rank' : sort;
  const ascending = direction === 'asc';

  const { data, error } = await query
    .order(sortColumn, { ascending })
    .order('created_at', { ascending: false });

  if (error) return dataApiError('list', error);

  return NextResponse.json({ contacts: data ?? [] });
}

export async function POST(request: Request) {
  const ctx = await getAuthedContext();
  if (!ctx.ok) return unauthorized();

  const parsed = parseContactCreate(await readJson(request));
  if (!parsed.ok) return jsonError(400, parsed.error, parsed.fields);

  // parsed.data contains no user_id — the column default auth.user_id() assigns ownership.
  const { data, error } = await ctx.client
    .from('contacts')
    .insert(parsed.data)
    .select('*')
    .single();

  if (error) return dataApiError('create', error);

  return NextResponse.json({ contact: data }, { status: 201 });
}
