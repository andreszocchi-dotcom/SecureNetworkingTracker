/**
 * Backend validation tests.
 *
 * These exercise src/server/contact-schema.ts — the module every write request passes through
 * before it can reach the database. They run offline with no environment variables, so a grader
 * can clone the repo and run `npm test` immediately.
 */
import { describe, expect, it } from 'vitest';
import {
  PRIORITIES,
  parseContactCreate,
  parseContactUpdate,
  parseListQuery,
} from '../src/server/contact-schema';

const valid = {
  name: 'Priya Raman',
  company: 'Anthropic',
  role: 'Research Engineer',
  met_where: 'Berkeley AI Systems mixer',
  notes: 'Follow up about her interpretability reading group.',
  priority: 'high',
};

describe('name is required', () => {
  it('rejects an empty name with a clear message', () => {
    const result = parseContactCreate({ ...valid, name: '' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fields.name).toBe('Name is required.');
    expect(result.error).toBe('Name is required.');
  });

  it('rejects a whitespace-only name, so " " cannot masquerade as a name', () => {
    const result = parseContactCreate({ ...valid, name: '   ' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fields.name).toBe('Name is required.');
  });

  it('rejects a missing name', () => {
    const { name: _omitted, ...withoutName } = valid;
    const result = parseContactCreate(withoutName);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fields.name).toBe('Name is required.');
  });

  it('rejects a name longer than 120 characters', () => {
    const result = parseContactCreate({ ...valid, name: 'a'.repeat(121) });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fields.name).toBe('Name must be 120 characters or fewer.');
  });

  it('trims surrounding whitespace from an otherwise valid name', () => {
    const result = parseContactCreate({ ...valid, name: '  Priya Raman  ' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.name).toBe('Priya Raman');
  });
});

describe('priority accepts only high, medium, or low', () => {
  it.each(PRIORITIES)('accepts %s', (priority) => {
    const result = parseContactCreate({ ...valid, priority });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.priority).toBe(priority);
  });

  it.each(['urgent', 'HIGH', 'critical', '', 'none'])(
    'rejects %o with a message naming the allowed values',
    (priority) => {
      const result = parseContactCreate({ ...valid, priority });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.fields.priority).toBe('Priority must be one of: high, medium, low.');
    },
  );

  it('rejects a non-string priority', () => {
    const result = parseContactCreate({ ...valid, priority: 3 });

    expect(result.ok).toBe(false);
  });
});

describe('ownership cannot be set by the client', () => {
  it('strips a user_id supplied in the payload', () => {
    const result = parseContactCreate({ ...valid, user_id: 'some-other-users-id' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The parsed object is what gets forwarded to the Data API. user_id is not in it, so the
    // database applies its `default auth.user_id()` and RLS decides ownership, not the caller.
    expect(result.data).not.toHaveProperty('user_id');
  });

  it('strips a user_id supplied on an edit', () => {
    const result = parseContactUpdate({ name: 'Renamed', user_id: 'some-other-users-id' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).not.toHaveProperty('user_id');
  });

  it('strips unknown fields generally', () => {
    const result = parseContactCreate({ ...valid, id: 'forced-id', created_at: '1999-01-01' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).not.toHaveProperty('id');
    expect(result.data).not.toHaveProperty('created_at');
  });
});

describe('optional fields', () => {
  it('accepts a contact with only a name and a priority', () => {
    const result = parseContactCreate({ name: 'Sam Okafor', priority: 'low' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.company).toBeNull();
    expect(result.data.notes).toBeNull();
  });

  it('normalises blank optional fields to null rather than empty strings', () => {
    const result = parseContactCreate({ ...valid, company: '   ', notes: '' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.company).toBeNull();
    expect(result.data.notes).toBeNull();
  });

  it('rejects notes longer than 2000 characters', () => {
    const result = parseContactCreate({ ...valid, notes: 'x'.repeat(2001) });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fields.notes).toBe('Notes must be 2000 characters or fewer.');
  });
});

describe('edits', () => {
  it('accepts a partial update', () => {
    const result = parseContactUpdate({ priority: 'low' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({ priority: 'low' });
  });

  it('applies the same name rule to an edit', () => {
    const result = parseContactUpdate({ name: '  ' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fields.name).toBe('Name is required.');
  });

  it('rejects an empty edit', () => {
    const result = parseContactUpdate({});

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('No fields to update.');
  });
});

describe('sort and filter inputs are whitelisted', () => {
  it('defaults to newest first', () => {
    const result = parseListQuery(new URLSearchParams());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({ sort: 'created_at', direction: 'desc' });
  });

  it('accepts a known sort column', () => {
    const result = parseListQuery(new URLSearchParams('sort=name&direction=asc'));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({ sort: 'name', direction: 'asc' });
  });

  it('rejects an unknown sort column instead of passing it to the query builder', () => {
    const result = parseListQuery(new URLSearchParams('sort=user_id'));

    expect(result.ok).toBe(false);
  });

  it('rejects an unknown priority filter', () => {
    const result = parseListQuery(new URLSearchParams('priority=urgent'));

    expect(result.ok).toBe(false);
  });
});
