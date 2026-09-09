import { describe, expect, it } from 'vitest';
import { PgCatalogRepository } from '../../src/postgres/repositories.js';

describe('PostgreSQL catalog query builders', () => {
  it('expands repeated search placeholders for name and SKU', async () => {
    const calls = [];
    const db = {
      many: async (sql, params) => {
        calls.push({ sql, params });
        return [];
      },
    };

    await new PgCatalogRepository(db).searchProducts({ search: 'hashbrown' });

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('(name ILIKE $1 OR sku ILIKE $1)');
    expect(calls[0].sql).not.toContain('$value');
    expect(calls[0].params).toEqual(['%hashbrown%']);
  });
});
