/**
 * Resets test user A's contacts to a small, realistic demo set.
 *
 *   npm run seed
 *
 * Used before the evidence capture so the screenshots show a coherent list rather than whatever
 * previous runs left behind. It talks to the public Data API as user A — no DATABASE_URL, no
 * admin access — so it is also a small demonstration that RLS scopes the delete: the
 * "delete everything" call below can only ever reach that one user's rows.
 */
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', quiet: true });

const AUTH_URL = required('NEXT_PUBLIC_NEON_AUTH_URL').replace(/\/$/, '');
const DATA_API_URL = required('NEXT_PUBLIC_NEON_DATA_API_URL').replace(/\/$/, '');
const ORIGIN = process.env.RLS_TEST_ORIGIN || 'http://localhost:3000';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Copy .env.example to .env.local first.`);
  return value;
}

const CONTACTS = [
  {
    name: 'Priya Raman',
    company: 'Anthropic',
    role: 'Research Engineer',
    met_where: 'Berkeley AI Systems mixer',
    notes: 'Follow up about her interpretability reading group.',
    priority: 'high',
  },
  {
    name: 'Marcus Chen',
    company: 'Sequoia Capital',
    role: 'Investment Partner',
    met_where: 'Haas startup pitch night',
    notes: 'Offered to review a deck if I ever raise.',
    priority: 'high',
  },
  {
    name: 'Dana Whitfield',
    company: 'UC Berkeley EECS',
    role: 'Postdoc, Sky Computing Lab',
    met_where: 'CS 262 office hours',
    notes: 'Said to email about the systems reading group in the fall.',
    priority: 'medium',
  },
  {
    name: 'Tomas Herrera',
    company: 'Figma',
    role: 'Design Engineer',
    met_where: 'Cal Hacks judging table',
    notes: 'Swapped notes on design systems. Coffee sometime.',
    priority: 'medium',
  },
  {
    name: 'Aisha Bello',
    company: 'Stripe',
    role: 'Engineering Manager',
    met_where: 'Berkeley alumni night in SF',
    notes: 'Hiring interns next spring.',
    priority: 'low',
  },
];

/** Signs in over plain HTTP and exchanges the session cookie for a Data API JWT. */
async function tokenFor(email, password) {
  const signIn = await fetch(`${AUTH_URL}/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ email, password }),
  });
  if (!signIn.ok) throw new Error(`sign-in failed for ${email}: ${signIn.status}`);

  const cookie = signIn.headers
    .getSetCookie()
    .map((line) => line.split(';')[0])
    .join('; ');

  const response = await fetch(`${AUTH_URL}/token`, { headers: { Origin: ORIGIN, Cookie: cookie } });
  if (!response.ok) throw new Error(`token exchange failed: ${response.status}`);

  const { token } = await response.json();
  return token;
}

const jwt = await tokenFor(required('TEST_USER_A_EMAIL'), required('TEST_USER_A_PASSWORD'));
const headers = {
  Authorization: `Bearer ${jwt}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

// PostgREST refuses an unfiltered DELETE, so match every row. RLS narrows it to this user's own.
const cleared = await fetch(
  `${DATA_API_URL}/contacts?id=neq.00000000-0000-0000-0000-000000000000`,
  { method: 'DELETE', headers },
).then((r) => r.json());
console.log(`Removed ${cleared.length} existing contact(s) for the demo user.`);

const created = await fetch(`${DATA_API_URL}/contacts`, {
  method: 'POST',
  headers,
  body: JSON.stringify(CONTACTS),
}).then((r) => r.json());
console.log(`Seeded ${created.length} contact(s).`);
