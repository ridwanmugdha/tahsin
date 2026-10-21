/* ==========================================================================
   Bookings and admin data in Postgres (e.g. Neon, added from Vercel's Storage
   tab). Used when DATABASE_URL is set. Each order is one row: the full order
   as JSON plus a few columns to look it up. Tables are created on first use.
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
  // Per-date settings from /admin/availability. NULL = use the catalogue's value / no limit.
  `CREATE TABLE IF NOT EXISTS ticket_days (
     product_id text NOT NULL,
     day text NOT NULL CHECK (day ~ '^\\d{4}-\\d{2}-\\d{2}$'),
     closed boolean NOT NULL DEFAULT false,
     capacity integer CHECK (capacity >= 0),
     adult integer CHECK (adult >= 0),
     child integer CHECK (child >= 0),
     updated_at timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (product_id, day)
   )`,
  `CREATE TABLE IF NOT EXISTS admin_users (
     username text PRIMARY KEY,
     password_hash text NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
];

const DAY_COLUMNS = 'product_id AS "productId", day AS date, closed, capacity, adult, child';

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

  const rows = async (text, params) => {
    await setup();
    return (await db.query(text, params)).rows;
  };
  const one = async (text, params) => (await rows(text, params))[0]?.data || null;

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
      return (await rows('SELECT data FROM orders ORDER BY created_at DESC')).map((r) => r.data);
    },

    // Guests per product and day, from paid orders and unpaid ones newer than holdSince.
    // A combo item counts once on each of its parts' products and dates.
    ticketsSold: (from, to, holdSince) => rows(
      `SELECT t.product_id AS "productId", t.day AS date, sum(t.guests)::int AS sold
         FROM orders o
         CROSS JOIN LATERAL jsonb_array_elements(o.data->'items') AS item
         CROSS JOIN LATERAL (
           SELECT coalesce(part->>'productId', item->>'productId') AS product_id,
                  coalesce(part->>'date', item->>'date') AS day,
                  coalesce((item->>'adults')::int, 0) + coalesce((item->>'children')::int, 0) AS guests
             FROM jsonb_array_elements(CASE WHEN jsonb_typeof(item->'parts') = 'array' THEN item->'parts' ELSE '[{}]'::jsonb END) AS part
         ) t
        WHERE (o.data->>'status' = 'paid' OR (o.data->>'status' = 'pending' AND o.created_at > $3::timestamptz))
          AND t.day BETWEEN $1 AND $2
        GROUP BY 1, 2`,
      [from, to, holdSince]),

    listDays: (from, to, productId) => rows(
      `SELECT ${DAY_COLUMNS} FROM ticket_days WHERE day BETWEEN $1 AND $2 AND ($3::text IS NULL OR product_id = $3) ORDER BY day`,
      [from, to, productId || null]),

    async putDays(list) {
      if (!list.length) return;
      const column = (key) => list.map((r) => r[key]);
      await rows(
        `INSERT INTO ticket_days (product_id, day, closed, capacity, adult, child)
         SELECT * FROM unnest($1::text[], $2::text[], $3::boolean[], $4::int[], $5::int[], $6::int[])
         ON CONFLICT (product_id, day) DO UPDATE SET closed = EXCLUDED.closed, capacity = EXCLUDED.capacity,
           adult = EXCLUDED.adult, child = EXCLUDED.child, updated_at = now()`,
        ['productId', 'date', 'closed', 'capacity', 'adult', 'child'].map(column));
    },

    async deleteDays(productId, dates) {
      await rows('DELETE FROM ticket_days WHERE product_id = $1 AND day = ANY($2::text[])', [productId, dates]);
    },

    async getAdmin(username) {
      const [admin] = await rows(
        'SELECT username, password_hash AS "passwordHash", created_at AS "createdAt" FROM admin_users WHERE username = $1', [username]);
      return admin || null;
    },

    async saveAdmin({ username, passwordHash }) {
      await rows(
        `INSERT INTO admin_users (username, password_hash) VALUES ($1, $2)
         ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
        [username, passwordHash]);
    },

    close: () => db.end?.(),
  };
}
