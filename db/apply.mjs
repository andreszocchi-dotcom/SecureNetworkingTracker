/**
 * Applies db/schema.sql to the Neon database and then prints proof that RLS is on and the four
 * ownership policies exist.
 *
 * DATABASE_URL is read from .env.local and is used ONLY here, from your machine. It is never
 * imported by application code and is never set as a Vercel runtime variable.
 *
 *   node db/apply.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(here, '..', '.env.local'), quiet: true });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. Add it to .env.local (see .env.example).');
  process.exit(1);
}

const client = new pg.Client({ connectionString });

try {
  await client.connect();

  const sql = readFileSync(join(here, 'schema.sql'), 'utf8');
  await client.query(sql);
  console.log('Applied db/schema.sql\n');

  const { rows: rls } = await client.query(
    `select relrowsecurity as enabled
       from pg_class
      where oid = 'public.contacts'::regclass`,
  );
  console.log(`Row Level Security enabled on public.contacts: ${rls[0].enabled}\n`);

  const { rows: policies } = await client.query(
    `select policyname, cmd, roles::text, qual, with_check
       from pg_policies
      where schemaname = 'public' and tablename = 'contacts'
      order by cmd`,
  );
  console.log(`Policies (${policies.length}):`);
  for (const p of policies) {
    console.log(`  ${p.cmd.padEnd(6)} ${p.policyname.padEnd(22)} roles=${p.roles}`);
    console.log(`         USING      ${p.qual ?? '—'}`);
    console.log(`         WITH CHECK ${p.with_check ?? '—'}`);
  }

  const { rows: cols } = await client.query(
    `select column_name, data_type, is_nullable, column_default
       from information_schema.columns
      where table_schema = 'public' and table_name = 'contacts'
      order by ordinal_position`,
  );
  console.log('\nColumns:');
  for (const c of cols) {
    console.log(
      `  ${c.column_name.padEnd(12)} ${c.data_type.padEnd(26)} ` +
        `${c.is_nullable === 'NO' ? 'NOT NULL' : 'NULL    '} ${c.column_default ?? ''}`,
    );
  }
} catch (err) {
  console.error('Failed to apply schema:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
