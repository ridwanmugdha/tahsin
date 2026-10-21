/* ==========================================================================
   /admin — the business's admin panel: sign in, see bookings, and set ticket
   availability and prices per date. Create a login with
   `npm run create-admin -- <username>`.
   ========================================================================== */
import express from 'express';
import { isDated, loadCalendar, resetDays, updateDays } from '../availability.js';
import { bookableRange, isIsoDate, romeNow } from '../booking.js';
import { ATTRACTIONS, PRODUCTS } from '../catalog.js';
import { rateLimit } from '../rate-limit.js';
import { listOrders } from '../store.js';
import { checkLogin, currentAdmin, requireAdmin, signIn, signOut } from './auth.js';
import { SOON, renderAvailability, renderBookings, renderLogin, renderOverview, renderSoon } from './views.js';

// Only send people back to admin pages after signing in.
const safeNext = (next) => (typeof next === 'string' && /^\/admin(\/[\w\-/?=&%.]*)?$/.test(next) && !next.startsWith('/admin/login') ? next : '/admin');

const MAX_PRICE = 10_000_00; // €10,000 in cents
const MAX_TICKETS = 100_000;

/** Checks a { closed?, capacity?, adult?, child? } change set from the editor. Returns [error, changes]. */
function readChanges(raw) {
  const changes = {};
  if (!raw || typeof raw !== 'object') return ['Nothing to save.'];
  if ('closed' in raw) {
    if (typeof raw.closed !== 'boolean') return ['Choose open or closed.'];
    changes.closed = raw.closed;
  }
  if ('capacity' in raw) {
    if (raw.capacity !== null && !(Number.isInteger(raw.capacity) && raw.capacity >= 0 && raw.capacity <= MAX_TICKETS)) return ['Tickets available must be a whole number (or empty for no limit).'];
    changes.capacity = raw.capacity;
  }
  for (const field of ['adult', 'child']) {
    if (!(field in raw)) continue;
    if (raw[field] !== null && !(Number.isInteger(raw[field]) && raw[field] >= 0 && raw[field] <= MAX_PRICE)) return [`Enter a ${field} price between €0 and €10,000.`];
    changes[field] = raw[field];
  }
  return Object.keys(changes).length ? [null, changes] : ['Nothing to save.'];
}

/** Checks { productId, dates } from the editor. Returns [error, productId, dates]. */
function readSelection(body) {
  const { productId, dates } = body || {};
  if (!isDated(productId)) return ['Choose an experience.'];
  const { from, to } = bookableRange(romeNow());
  if (!Array.isArray(dates) || !dates.length || dates.length > 400) return ['Select one or more days.'];
  if (!dates.every((d) => isIsoDate(d) && d >= from && d <= to)) return ['Only today and future dates can be changed.'];
  return [null, productId, [...new Set(dates)]];
}

export function adminRouter({ brand }) {
  const router = express.Router();

  router.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    next();
  });

  /* ---- Sign in / out ---------------------------------------------------- */
  router.get('/login', async (req, res) => {
    if (await currentAdmin(req)) return res.redirect(safeNext(req.query.next));
    res.type('html').send(renderLogin({ brand, next: safeNext(req.query.next) }));
  });

  const tooManyLogins = (req, res) => res.status(429).type('html')
    .send(renderLogin({ brand, error: 'Too many sign-in attempts. Please wait 15 minutes and try again.' }));

  router.post('/login', rateLimit(10, 15 * 60 * 1000, tooManyLogins), express.urlencoded({ extended: false, limit: '8kb' }), async (req, res) => {
    const { username, password, next } = req.body || {};
    const admin = await checkLogin(username, password);
    if (!admin) {
      return res.status(401).type('html').send(renderLogin({ brand, error: 'That admin ID and password don’t match.', username, next: safeNext(next) }));
    }
    await signIn(req, res, admin);
    res.redirect(303, safeNext(next));
  });

  router.post('/logout', (req, res) => {
    signOut(req, res);
    res.redirect(303, '/admin/login');
  });

  /* ---- Everything below needs a signed-in admin ------------------------- */
  router.use(requireAdmin);

  router.get('/', async (req, res) => {
    res.type('html').send(renderOverview({ brand, username: req.admin.username, orders: await listOrders(), today: romeNow().date }));
  });

  router.get('/bookings', async (req, res) => {
    res.type('html').send(renderBookings({ brand, username: req.admin.username, orders: await listOrders() }));
  });

  router.get('/availability', (req, res) => {
    const { from, to } = bookableRange(romeNow());
    const products = PRODUCTS.filter((p) => !p.parts).map((p) => ({
      id: p.id, name: p.name, attraction: p.attraction, venue: ATTRACTIONS[p.attraction].name,
      adult: p.adult, child: p.child,
      closedWeekdays: ATTRACTIONS[p.attraction].closedWeekdays, closedDates: ATTRACTIONS[p.attraction].closedDates,
    }));
    res.type('html').send(renderAvailability({ brand, username: req.admin.username, data: { today: from, lastDay: to, products } }));
  });

  /* ---- JSON API for the availability calendar --------------------------- */
  router.get('/api/calendar', async (req, res) => {
    const { product, from, to } = req.query;
    if (!isDated(product) || !isIsoDate(from) || !isIsoDate(to) || to < from) return res.status(400).json({ error: 'Bad request.' });
    const calendar = await loadCalendar(from, to, product);
    res.json({ days: calendar.list().map(({ date, closed, capacity, adult, child, sold, left }) => ({ date, closed, capacity, adult, child, sold, left })) });
  });

  router.put('/api/days', async (req, res) => {
    const [selectionError, productId, dates] = readSelection(req.body);
    if (selectionError) return res.status(422).json({ error: selectionError });
    const [changesError, changes] = readChanges(req.body.changes);
    if (changesError) return res.status(422).json({ error: changesError });
    await updateDays(productId, dates, changes);
    console.log(`[admin] ${req.admin.username} updated ${productId} on ${dates.length} day(s):`, JSON.stringify(changes));
    res.json({ ok: true });
  });

  router.delete('/api/days', async (req, res) => {
    const [selectionError, productId, dates] = readSelection(req.body);
    if (selectionError) return res.status(422).json({ error: selectionError });
    await resetDays(productId, dates);
    console.log(`[admin] ${req.admin.username} reset ${productId} on ${dates.length} day(s)`);
    res.json({ ok: true });
  });

  router.get('/:section', (req, res, next) => {
    if (!Object.hasOwn(SOON, req.params.section)) return next();
    res.type('html').send(renderSoon({ brand, username: req.admin.username, key: req.params.section }));
  });

  return router;
}
