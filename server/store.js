/* ==========================================================================
   Order storage: one JSON file (data/orders.json).
   Fine for a launch with modest volume. Writes are queued so two requests
   never overwrite each other, and each write is atomic (temp file + rename).
   For larger volume, swap these functions for a real database.
   ========================================================================== */
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
const FILE = path.join(DATA_DIR, 'orders.json');

let orders = null;
let queue = Promise.resolve();

async function load() {
  if (orders) return orders;
  try {
    orders = JSON.parse(await readFile(FILE, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    orders = [];
  }
  return orders;
}

function persist() {
  const snapshot = JSON.stringify(orders, null, 2);
  queue = queue.then(async () => {
    await mkdir(DATA_DIR, { recursive: true });
    const tmp = `${FILE}.${process.pid}.tmp`;
    await writeFile(tmp, snapshot);
    await rename(tmp, FILE);
  });
  return queue;
}

// Readable booking reference without look-alike characters (no 0/O, 1/I).
function makeRef() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(6);
  return `ET-${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')}`;
}

export async function createOrder(draft) {
  await load();
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
  orders.push(order);
  await persist();
  return order;
}

export async function getOrder(id) {
  await load();
  return orders.find((o) => o.id === id) || null;
}

export async function findOrder(predicate) {
  await load();
  return orders.find(predicate) || null;
}

export async function updateOrder(id, patch) {
  await load();
  const order = orders.find((o) => o.id === id);
  if (!order) return null;
  Object.assign(order, patch, { updatedAt: new Date().toISOString() });
  await persist();
  return order;
}

export async function listOrders() {
  await load();
  return [...orders].reverse();
}
