import { describe, expect, it } from 'vitest';
import { allocatePostgresOrderNumber } from '../../src/postgres/order-number.js';

describe('PostgreSQL daily order sequence', () => {
  it('uses the database-returned sequence value', async () => {
    const calls = [];
    const db = {
      one: async (sql, params) => {
        calls.push({ sql, params });
        return { last_value: 42 };
      },
    };

    const result = await allocatePostgresOrderNumber(db);

    expect(result.dailySequence).toBe(42);
    expect(result.orderNumber).toMatch(/-042$/);
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('ON CONFLICT');
  });
});
