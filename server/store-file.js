/* ==========================================================================
   Bookings in one JSON file (data/orders.json). Used when no DATABASE_URL is
   set: on your own computer, or on a host with a persistent disk.
   Writes are queued so two requests never overwrite each other, and each
   write is atomic (temp file + rename).
   ========================================================================== */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function fileBackend(dir) {
  const file = path.join(dir, 'orders.json');
  let orders = null;
  let queue = Promise.resolve();

  async function load() {
    if (orders) return orders;
    try {
      orders = JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      orders = [];
    }
    return orders;
  }

  function persist() {
    const snapshot = JSON.stringify(orders, null, 2);
    queue = queue.then(async () => {
      await mkdir(dir, { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, snapshot);
      await rename(tmp, file);
    });
    return queue;
  }

  return {
    name: `file (${file})`,

    async insert(order) {
      (await load()).push(order);
      await persist();
    },

    async get(id) {
      return (await load()).find((o) => o.id === id) || null;
    },

    async findByPayment(reference) {
      return (await load()).find((o) => o.payment?.reference === reference) || null;
    },

    async update(id, patch, { ifStatus } = {}) {
      const order = (await load()).find((o) => o.id === id);
      if (!order || (ifStatus && order.status !== ifStatus)) return null;
      Object.assign(order, patch);
      await persist();
      return order;
    },

    async list() {
      return [...(await load())].reverse();
    },
  };
}
