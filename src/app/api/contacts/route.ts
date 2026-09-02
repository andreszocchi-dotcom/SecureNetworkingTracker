/**
 * Backend: list and create contacts.
 *
 *   GET  /api/contacts   list the caller's contacts, sorted and filtered
 *   POST /api/contacts   create a contact
 *
 * Every request takes the same three steps: verify the caller's JWT against Managed Better Auth's
 * public JWKS, validate the input in trusted server code, then talk to the database as that same
 * user so Row Level Security still has the final say.
 *
 * Note there is no `.eq('user_id', ...)` below, on purpose. The handler never filters by user;
 * Postgres does. There is no ownership check here to forget.
 */
import { NextResponse } from 'next/server';
import { getAuthedContext } from '@/server/data-api';
import { parseContactCreate, parseListQuery } from '@/server/contact-schema';
import { dataApiError, jsonError, readJson, unauthorized } from '@/server/http';

export const dynamic = 'force-dynamic';

const BACKSLASH = String.fromCharCode(92);

/**
 * PostgREST reads , . ( ) : as syntax inside an or() filter, so the search term has to be quoted.
 * Rather than escape the two characters that could break out of those quotes, drop them: a search
 * box has no legitimate use for a quote or a backslash, and removing them means no caller-supplied
 * character can change the shape of the filter expression.
 */
function quoteForFilter(value: string): string {
  const safe = Array.from(value)
    .filter((character) => character !== '"' && character !== BACKSLASH)
    .join('');
  return `"*${safe}*"`;
}

export async function GET(request: Request) {
  const ctx = await getAuthedContext(request);
  if (!ctx.ok) return unauthorized();

  // Sort and filter arrive as query parameters, so they are caller-controlled and get the same
  // treatment as a request body: whitelisted through an enum before they reach the query builder.
  // A crafted `?sort=user_id` is rejected here rather than passed through as a column name.
  const parsed = parseListQuery(new URL(request.url).searchParams);
  if (!parsed.ok) return jsonError(400, parsed.error, parsed.fields);

  const { sort, direction, priority, search } = parsed.data;

  let query = ctx.client.from('contacts').select('*');

  if (priority) query = query.eq('priority', priority);

  if (search) {
    const term = quoteForFilter(search);
    query = query.or(`name.ilike.${term},company.ilike.${term}`);
  }

  // Priority sorts by the generated rank column so the order is high, medium, low rather than
  // alphabetical. created_at is the tie-breaker so the order is stable.
  const column = sort === 'priority' ? 'priority_rank' : sort;

  const { data, error } = await query
    .order(column, { ascending: direction === 'asc' })
    .order('created_at', { ascending: false });

  if (error) return dataApiError('list', error);

  return NextResponse.json({ contacts: data ?? [] });
}

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
