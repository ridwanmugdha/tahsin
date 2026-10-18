/* ==========================================================================
   Order storage. Picks where bookings are kept:
     DATABASE_URL set  -> Postgres (needed on Vercel, whose disk is temporary)
     otherwise         -> one JSON file, data/orders.json (or DATA_DIR)
   ========================================================================== */
import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileBackend } from './store-file.js';
import { connectPostgres, postgresBackend } from './store-postgres.js';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const backend = DATABASE_URL
  ? postgresBackend(connectPostgres(DATABASE_URL))
  : fileBackend(process.env.DATA_DIR || path.resolve('data'));

export const storeName = backend.name;
// Vercel can't keep files, so without a database bookings would be lost.
export const storeProblem = process.env.VERCEL && !DATABASE_URL
  ? 'DATABASE_URL is not set. Add a Postgres database (Vercel -> Storage) to take bookings.'
  : null;

// Readable booking reference without look-alike characters (no 0/O, 1/I).
function makeRef() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(6);
  return `ET-${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')}`;
}

export async function createOrder(draft) {
  const now = new Date().toISOString();
  const order = {
    id: randomUUID(),
    ref: makeRef(),
    // Secret that lets the customer's browser read this order (the id alone is not enough).
    token: randomBytes(24).toString('hex'),
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    ...draft,
  };
  await backend.insert(order);
  return order;
}

export const getOrder = (id) => backend.get(id);

export const findOrderByPayment = (reference) => backend.findByPayment(reference);

/** Merges `patch` into the order. With { ifStatus }, only if the order still has that status (else null). */
export const updateOrder = (id, patch, options) => backend.update(id, { ...patch, updatedAt: new Date().toISOString() }, options);

/** Newest first. */
export const listOrders = () => backend.list();
