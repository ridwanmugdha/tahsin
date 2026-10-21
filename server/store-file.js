/* ==========================================================================
   Bookings and admin data in JSON files (data/orders.json, ticket-days.json,
   admins.json). Used when no DATABASE_URL is set: on your own computer, or on
   a host with a persistent disk.
   Writes are queued so two requests never overwrite each other, and each
   write is atomic (temp file + rename).
   ========================================================================== */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** One JSON array on disk, loaded once and kept in memory. */
function jsonFile(dir, name) {
  const file = path.join(dir, name);
  let rows = null;
  let queue = Promise.resolve();

  return {
    file,

    async load() {
      if (rows) return rows;
      try {
        rows = JSON.parse(await readFile(file, 'utf8'));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        rows = [];
      }
      return rows;
    },

    async replace(next) {
      rows = next;
      return this.save();
    },

    save() {
      const snapshot = JSON.stringify(rows, null, 2);
      queue = queue.then(async () => {
        await mkdir(dir, { recursive: true });
        const tmp = `${file}.${process.pid}.tmp`;
        await writeFile(tmp, snapshot);
        await rename(tmp, file);
      });
      return queue;
    },
  };
}

export function fileBackend(dir) {
  const orders = jsonFile(dir, 'orders.json');
  const days = jsonFile(dir, 'ticket-days.json');
  const admins = jsonFile(dir, 'admins.json');

  return {
    name: `file (${orders.file})`,

    async insert(order) {
      (await orders.load()).push(order);
      await orders.save();
    },

    async get(id) {
      return (await orders.load()).find((o) => o.id === id) || null;
    },

    async findByPayment(reference) {
      return (await orders.load()).find((o) => o.payment?.reference === reference) || null;
    },

    async update(id, patch, { ifStatus } = {}) {
      const order = (await orders.load()).find((o) => o.id === id);
      if (!order || (ifStatus && order.status !== ifStatus)) return null;
      Object.assign(order, patch);
      await orders.save();
      return order;
    },

    async list() {
      return [...(await orders.load())].reverse();
    },

    async ticketsSold(from, to, holdSince) {
      const counts = new Map();
      for (const order of await orders.load()) {
        if (order.status !== 'paid' && !(order.status === 'pending' && order.createdAt > holdSince)) continue;
        for (const item of order.items) {
          const guests = (item.adults || 0) + (item.children || 0);
          for (const { productId, date } of item.parts || [item]) {
            if (!date || date < from || date > to) continue;
            const key = `${productId}|${date}`;
            counts.set(key, (counts.get(key) || 0) + guests);
          }
        }
      }
      return [...counts].map(([key, sold]) => {
        const [productId, date] = key.split('|');
        return { productId, date, sold };
      });
    },

    async listDays(from, to, productId) {
      return (await days.load())
        .filter((d) => d.date >= from && d.date <= to && (!productId || d.productId === productId))
        .map((d) => ({ ...d }));
    },

    async putDays(rows) {
      const keep = (await days.load()).filter((d) => !rows.some((r) => r.productId === d.productId && r.date === d.date));
      await days.replace([...keep, ...rows.map((r) => ({ ...r }))]);
    },

    async deleteDays(productId, dates) {
      await days.replace((await days.load()).filter((d) => d.productId !== productId || !dates.includes(d.date)));
    },

    async getAdmin(username) {
      return (await admins.load()).find((a) => a.username === username) || null;
    },

    async saveAdmin(admin) {
      await admins.replace([...(await admins.load()).filter((a) => a.username !== admin.username), admin]);
    },

    async close() {},
  };
}
