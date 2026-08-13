import pg from 'pg';

const { Pool } = pg;
// Keep timestamptz/date values as ISO-like strings, matching the SQLite API
// shape and avoiding implicit local-time conversions in the report/export UI.
pg.types.setTypeParser(1082, (value) => value);
pg.types.setTypeParser(1184, (value) => value);

/**
 * Small database port used by the hosted runtime. Keeping this wrapper in the
 * server means repositories never receive the pool directly and cannot forget
 * to release a transaction client.
 */
export class PostgresDatabase {
  constructor({ connectionString, max = 5, statementTimeoutMs = 8000, client, ssl = true } = {}) {
    this.dialect = 'postgres';
    this.statementTimeoutMs = statementTimeoutMs;
    this.client = client || null;
    this.pool = client
      ? null
      : new Pool({
          connectionString,
          max,
          idleTimeoutMillis: 10_000,
          connectionTimeoutMillis: 8_000,
          statement_timeout: statementTimeoutMs,
          application_name: process.env.APP_NAME || 'sweet-gonz-kiosk',
          options: '-c search_path=app,public',
          ssl: ssl ? { rejectUnauthorized: false } : false,
        });
  }

  async query(text, values = []) {
    const target = this.client || this.pool;
    return target.query({ text, values, statement_timeout: this.statementTimeoutMs });
  }

  async one(text, values = []) {
    const result = await this.query(text, values);
    return result.rows[0] || null;
  }

  async many(text, values = []) {
    const result = await this.query(text, values);
    return result.rows;
  }

  async exec(text, values = []) {
    return this.query(text, values);
  }

  async transaction(callback) {
    if (this.client) return callback(this);
    const client = await this.pool.connect();
    const tx = new PostgresDatabase({ client, statementTimeoutMs: this.statementTimeoutMs });
    try {
      await client.query('BEGIN');
      const result = await callback(tx);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async health() {
    await this.one('SELECT 1 AS ok');
    return true;
  }

  async close() {
    await this.pool?.end();
  }
}

export function openPostgres(env) {
  if (!env.databaseUrl) {
    throw new Error('DATABASE_URL is required when DATABASE_PROVIDER=postgres');
  }
  return new PostgresDatabase({
    connectionString: env.databaseUrl,
    max: env.databasePoolMax,
    statementTimeoutMs: env.databaseStatementTimeoutMs,
    ssl: env.pgssl,
  });
}
