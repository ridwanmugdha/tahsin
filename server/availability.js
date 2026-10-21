/* ==========================================================================
   Ticket availability and prices per date, set by the business at
   /admin/availability. A date without settings sells with no limit at the
   catalogue's prices (catalog.js). Combos use their own catalogue price and
   take tickets from each part's product on that part's date.
   ========================================================================== */
import { getProduct } from './catalog.js';
import { deleteDays, listDays, putDays, ticketsSold } from './store.js';

// Unpaid orders keep their tickets this long (Stripe's payment page expires after 1 hour).
export const HOLD_MINUTES = 60;

const BLANK = { closed: false, capacity: null, adult: null, child: null };
const isBlank = (row) => !row.closed && row.capacity === null && row.adult === null && row.child === null;
const key = (productId, date) => `${productId}|${date}`;

/** Settings plus tickets sold for every product and day in the range (YYYY-MM-DD, inclusive). */
export async function loadCalendar(from, to, productId) {
  const holdSince = new Date(Date.now() - HOLD_MINUTES * 60_000).toISOString();
  const [rows, sold] = await Promise.all([listDays(from, to, productId), ticketsSold(from, to, holdSince)]);
  const days = new Map(rows.map((row) => [key(row.productId, row.date), { ...BLANK, ...row, sold: 0 }]));
  for (const s of sold) {
    if (productId && s.productId !== productId) continue;
    const k = key(s.productId, s.date);
    days.set(k, { ...BLANK, productId: s.productId, date: s.date, ...days.get(k), sold: s.sold });
  }

  /** { closed, capacity, adult, child, sold, left }: left is null when there is no limit. */
  const day = (id, date) => {
    const found = days.get(key(id, date)) || { ...BLANK, productId: id, date, sold: 0 };
    return { ...found, left: found.capacity === null ? null : Math.max(0, found.capacity - found.sold) };
  };
  return { day, list: () => [...days.values()].map((d) => day(d.productId, d.date)) };
}

/** What the website needs to show prices and block closed or sold-out days: only days with settings. */
export function publicDays(calendar) {
  const out = {};
  for (const day of calendar.list()) {
    if (isBlank(day)) continue;
    const entry = {};
    if (day.closed) entry.closed = true;
    if (day.adult !== null) entry.adult = day.adult;
    if (day.child !== null) entry.child = day.child;
    if (day.left !== null) entry.left = day.left;
    (out[day.productId] ??= {})[day.date] = entry;
  }
  return out;
}

/**
 * Applies `changes` (any of closed, capacity, adult, child; null = back to the
 * default) to each date, keeping each day's other settings.
 */
export async function updateDays(productId, dates, changes) {
  const sorted = [...dates].sort();
  const existing = new Map((await listDays(sorted[0], sorted.at(-1), productId)).map((row) => [row.date, row]));
  const rows = sorted.map((date) => ({ ...BLANK, ...existing.get(date), ...changes, productId, date }));
  const cleared = rows.filter(isBlank).map((row) => row.date);
  await putDays(rows.filter((row) => !isBlank(row)));
  if (cleared.length) await deleteDays(productId, cleared);
}

export const resetDays = (productId, dates) => deleteDays(productId, dates);

/** Products whose dates can be managed (combos follow their parts). */
export const isDated = (productId) => {
  const product = getProduct(productId);
  return Boolean(product && !product.parts);
};
