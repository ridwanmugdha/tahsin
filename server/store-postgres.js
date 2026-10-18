/* ==========================================================================
   Bookings in Postgres (e.g. Neon, added from Vercel's Storage tab). Used
   when DATABASE_URL is set. Each order is one row: the full order as JSON
   plus a few columns to look it up. The table is created on first use.
   ========================================================================== */
import { attachDatabasePool } from '@vercel/functions';
import pg from 'pg';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS orders (
     id text PRIMARY KEY,
     ref text NOT NULL UNIQUE,
     created_at timestamptz NOT NULL,
     data jsonb NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS orders_payment_reference_idx ON orders ((data->'payment'->>'reference'))`,
];

/** A connection pool for DATABASE_URL (use the pooled "-pooler" address on Neon). */
export function connectPostgres(url) {
  const pool = new pg.Pool({ connectionString: url, max: 5, idleTimeoutMillis: 5000 });
  pool.on('error', (error) => console.warn('[db] idle connection error:', error.message));
  // On Vercel: closes idle connections before the function is suspended.
  attachDatabasePool(pool);
  return pool;
}

/** `db` is anything with query(text, params) -> { rows }, e.g. a pg.Pool. */
export function postgresBackend(db) {
  let ready = null;
  const setup = () => (ready ??= (async () => {
    for (const statement of SCHEMA) await db.query(statement);
  })().catch((error) => { ready = null; throw error; }));

  const one = async (text, params) => {
    await setup();
    return (await db.query(text, params)).rows[0]?.data || null;
  };

  return {
    name: 'postgres',

    async insert(order) {
      await setup();
      await db.query('INSERT INTO orders (id, ref, created_at, data) VALUES ($1, $2, $3, $4::jsonb)',
        [order.id, order.ref, order.createdAt, JSON.stringify(order)]);
    },

    get: (id) => one('SELECT data FROM orders WHERE id = $1', [id]),

    findByPayment: (reference) => one(
      "SELECT data FROM orders WHERE data->'payment'->>'reference' = $1 LIMIT 1", [reference]),

    // `||` merges the top-level fields, like Object.assign in the file store.
    update: (id, patch, { ifStatus } = {}) => (ifStatus
      ? one("UPDATE orders SET data = data || $2::jsonb WHERE id = $1 AND data->>'status' = $3 RETURNING data",
        [id, JSON.stringify(patch), ifStatus])
      : one('UPDATE orders SET data = data || $2::jsonb WHERE id = $1 RETURNING data', [id, JSON.stringify(patch)])),

    async list() {
      await setup();
      return (await db.query('SELECT data FROM orders ORDER BY created_at DESC')).rows.map((r) => r.data);
    },
  };
}
