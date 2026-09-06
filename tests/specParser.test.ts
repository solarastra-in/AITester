import { describe, it, expect } from 'vitest';
import {
  getDotted,
  setDotted,
  extractPlaceholders,
  resolveTemplates,
  parseStructuredJson,
  parseStructuredCsv,
  parseMarkdownTable,
} from '../server/specParser.js';

describe('getDotted / setDotted', () => {
  it('reads a nested path that exists', () => {
    expect(getDotted({ user: { id: 'u1' } }, 'user.id')).toBe('u1');
  });

  it('returns the given fallback (not an invented value) when a path is missing', () => {
    expect(getDotted({ user: {} }, 'user.email', 'NO_FALLBACK_SET')).toBe('NO_FALLBACK_SET');
    expect(getDotted({}, 'a.b.c')).toBe('');
  });

  it('writes a nested path, creating intermediate objects', () => {
    const obj: any = {};
    setDotted(obj, 'auth.tokens.admin', 'abc123');
    expect(obj.auth.tokens.admin).toBe('abc123');
  });
});

describe('extractPlaceholders', () => {
  it('finds every {{variable}} placeholder actually present in the input', () => {
    const found = extractPlaceholders('{{baseUrl}}/users/{{userId}}', { header: 'Bearer {{authToken}}' });
    expect(found.sort()).toEqual(['authToken', 'baseUrl', 'userId'].sort());
  });

  it('returns an empty list when there are no placeholders (never fabricates one)', () => {
    expect(extractPlaceholders('https://example.com/health')).toEqual([]);
  });
});

describe('resolveTemplates', () => {
  it('substitutes only variables that exist in the dataset', () => {
    const result = resolveTemplates('{{baseUrl}}/api/{{path}}', { baseUrl: 'https://api.example.com', path: 'users' });
    expect(result).toBe('https://api.example.com/api/users');
  });

  it('resolves an unknown variable to an empty string rather than a made-up value', () => {
    const result = resolveTemplates('{{missingVar}}', {});
    expect(result).toBe('');
  });

  it('recurses through nested objects and arrays', () => {
    const result = resolveTemplates(
      { headers: { Authorization: 'Bearer {{token}}' }, tags: ['{{env}}', 'static'] },
      { token: 'tok_real_123', env: 'staging' }
    );
    expect(result).toEqual({ headers: { Authorization: 'Bearer tok_real_123' }, tags: ['staging', 'static'] });
  });
});

describe('parseStructuredJson', () => {
  it('parses a real array of case rows into drafts with sane defaults, not placeholder content', () => {
    const rows = [
      { id: 'TC-1', title: 'Get user profile', category: 'Auth', priority: 'High', type: 'http' },
    ];
    const drafts = parseStructuredJson(rows);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].ext_id).toBe('TC-1');
    expect(drafts[0].title).toBe('Get user profile');
    expect(drafts[0].priority).toBe('High');
  });

  it('falls back priority to Medium only when the row genuinely omits it', () => {
    const drafts = parseStructuredJson([{ title: 'No priority given' }]);
    expect(drafts[0].priority).toBe('Medium');
  });

  it('accepts a JSON string as well as a parsed array', () => {
    const drafts = parseStructuredJson(JSON.stringify([{ title: 'From string' }]));
    expect(drafts).toHaveLength(1);
    expect(drafts[0].title).toBe('From string');
  });
});

describe('parseStructuredCsv', () => {
  it('parses real CSV rows into case drafts', () => {
    const csv = 'id,title,category,priority\nTC-1,Login works,Auth,High\nTC-2,Logout works,Auth,Low';
    const drafts = parseStructuredCsv(csv);
    expect(drafts).toHaveLength(2);
    expect(drafts[0].title).toBe('Login works');
    expect(drafts[1].priority).toBe('Low');
  });

  it('handles quoted fields containing commas', () => {
    const csv = 'id,title\nTC-1,"Handles, commas, correctly"';
    const drafts = parseStructuredCsv(csv);
    expect(drafts[0].title).toBe('Handles, commas, correctly');
  });
});

describe('parseMarkdownTable', () => {
  it('parses a real markdown table into case drafts', () => {
    const md = `
| id | description | priority |
|----|-------------|----------|
| TC-1 | Checkout succeeds | High |
| TC-2 | Empty cart blocked | Medium |
`;
    const drafts = parseMarkdownTable(md);
    expect(drafts).toHaveLength(2);
    expect(drafts[0].title).toBe('Checkout succeeds');
    expect(drafts[1].title).toBe('Empty cart blocked');
  });
});
