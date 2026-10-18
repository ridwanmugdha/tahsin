/* ==========================================================================
   Eterna server: serves the website (public/) and the checkout API.
   Start with `npm start`. Settings come from .env (see .env.example).
   ========================================================================== */
import express from 'express';
import path from 'node:path';
import { buildDraft } from './booking.js';
import { publicCatalog } from './catalog.js';
import { adminAuth, renderAdmin } from './admin.js';
import { selectProvider } from './payments/index.js';
import { createOrder, findOrder, getOrder, listOrders, updateOrder } from './store.js';

const PORT = Number(process.env.PORT) || 3000;
const BRAND = process.env.BRAND_NAME || 'Eterna';
const IS_PROD = process.env.NODE_ENV === 'production';
const provider = selectProvider({ env: process.env, isProd: IS_PROD, brand: BRAND });

const app = express();
app.disable('x-powered-by');
// Behind a hosting proxy (Render, Railway, Fly, Nginx…) set TRUST_PROXY=1 so client IPs are read correctly.
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'SAMEORIGIN',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  if (IS_PROD) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// Where payment pages send customers back to. Always set PUBLIC_URL in production.
const baseUrl = (req) => (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

/* --------------------------------------------------------------------------
   Order status helpers
   -------------------------------------------------------------------------- */
async function applyStatus(order, status) {
  if (!order || !status || status === order.status) return order;
  if (order.status === 'paid') return order; // never downgrade a paid order
  if (status === 'paid') {
    console.log(`[order] ${order.ref} paid (${order.payment?.provider})`);
    return updateOrder(order.id, { status: 'paid', paidAt: new Date().toISOString() });
  }
  if (['failed', 'expired'].includes(status) && order.status === 'pending') return updateOrder(order.id, { status });
  return order;
}

function publicOrder(order) {
  const { id, ref, status, total, currency, createdAt, paidAt, items, customer, payment } = order;
  return {
    id, ref, status, total, currency, createdAt, paidAt,
    provider: payment?.provider,
    customer: { firstName: customer.firstName, lastName: customer.lastName, email: customer.email },
    items: items.map(({ productId, name, attraction, date, time, parts, adults, children, lineTotal, cancellation, guests }) => (
      { productId, name, attraction, date, time, parts, adults, children, lineTotal, cancellation, guests }
    )),
  };
}

async function orderFromRequest(req, res) {
  const order = await getOrder(req.params.id);
  const token = req.query.token || req.body?.token;
  if (!order || typeof token !== 'string' || token !== order.token) {
    res.status(404).json({ error: 'Booking not found.' });
    return null;
  }
  return order;
}

// Tiny in-memory rate limit for creating orders (per IP).
const hits = new Map();
function rateLimit(limit, windowMs) {
  return (req, res, next) => {
    const now = Date.now();
    const entry = hits.get(req.ip);
    if (!entry || entry.reset < now) hits.set(req.ip, { count: 1, reset: now + windowMs });
    else if (++entry.count > limit) return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
    next();
  };
}

/* --------------------------------------------------------------------------
   Webhooks (registered before express.json: Stripe needs the raw body)
   -------------------------------------------------------------------------- */
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
  if (provider?.name !== 'stripe') return res.status(404).end();
  let result;
  try {
    result = await provider.webhook(req);
  } catch (error) {
    console.warn('[stripe webhook] rejected:', error.message);
    return res.status(400).send('Invalid signature');
  }
  if (result) {
    const order = await findOrder((o) => o.payment?.reference === result.reference);
    await applyStatus(order, result.status);
  }
  res.json({ received: true });
});

app.post('/api/webhooks/sumup', express.json({ limit: '64kb' }), async (req, res) => {
  if (provider?.name !== 'sumup') return res.status(404).end();
  const checkoutId = req.body?.id;
  if (typeof checkoutId === 'string') {
    const order = await findOrder((o) => o.payment?.reference === checkoutId);
    // SumUp webhooks are not signed, so we never trust the body: ask SumUp for the real status.
    if (order && order.status === 'pending') await applyStatus(order, await provider.verify(order));
  }
  res.json({ received: true });
});

app.use(express.json({ limit: '64kb' }));

/* --------------------------------------------------------------------------
   Checkout API
   -------------------------------------------------------------------------- */
app.get('/api/config', (req, res) => {
  res.json({
    brand: BRAND,
    ready: Boolean(provider),
    provider: provider?.name || null,
    providerLabel: provider?.label || null,
    testMode: provider?.name === 'demo' || provider?.testMode === true,
  });
});

app.get('/api/catalog', (req, res) => res.json(publicCatalog()));

app.post('/api/orders', rateLimit(20, 10 * 60 * 1000), async (req, res) => {
  if (!provider) return res.status(503).json({ error: 'Online booking is not open yet. Please contact us to book.' });

  const { errors, draft } = buildDraft(req.body);
  if (errors) return res.status(422).json({ error: 'Please check the highlighted details.', fields: errors });

  let order = await createOrder({ ...draft, payment: { provider: provider.name } });
  try {
    const { reference, next } = await provider.createPayment(order, { baseUrl: baseUrl(req) });
    order = await updateOrder(order.id, { payment: { provider: provider.name, reference } });
    res.status(201).json({ id: order.id, ref: order.ref, token: order.token, total: order.total, currency: order.currency, next });
  } catch (error) {
    console.error(`[order] ${order.ref} payment setup failed:`, error.message);
    await updateOrder(order.id, { status: 'failed', paymentError: error.message });
    res.status(502).json({ error: 'We couldn’t start the payment. Please try again in a moment.' });
  }
});

app.get('/api/orders/:id', async (req, res) => {
  let order = await orderFromRequest(req, res);
  if (!order) return;
  if (order.status === 'pending' && order.payment?.reference && provider?.name === order.payment.provider) {
    try {
      order = await applyStatus(order, await provider.verify(order));
    } catch (error) {
      console.warn(`[order] ${order.ref} status check failed:`, error.message);
    }
  }
  res.json(publicOrder(order));
});

// Test mode only: marks the order as paid without any money moving.
app.post('/api/orders/:id/pay-demo', async (req, res) => {
  if (provider?.name !== 'demo') return res.status(404).json({ error: 'Not available.' });
  const order = await orderFromRequest(req, res);
  if (!order) return;
  res.json(publicOrder(await applyStatus(order, 'paid')));
});

/* --------------------------------------------------------------------------
   Orders overview for the business (password protected via ADMIN_PASSWORD)
   -------------------------------------------------------------------------- */
app.get('/admin', adminAuth(process.env.ADMIN_PASSWORD), async (req, res) => {
  res.type('html').send(renderAdmin(await listOrders(), BRAND));
});

/* --------------------------------------------------------------------------
   Website
   -------------------------------------------------------------------------- */
app.use(express.static(path.resolve('public'), { extensions: ['html'], maxAge: IS_PROD ? '1h' : 0 }));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((req, res) => res.status(404).sendFile(path.resolve('public/index.html')));

app.use((error, req, res, next) => {
  console.error('[server]', error);
  if (res.headersSent) return next(error);
  res.status(error.status || 500).json({ error: error.expose ? error.message : 'Something went wrong. Please try again.' });
});

app.listen(PORT, () => {
  const mode = provider ? `${provider.label}${provider.testMode ? ' (test keys)' : ''}` : 'payments OFF (no keys set)';
  console.log(`${BRAND} running at http://localhost:${PORT} · payments: ${mode}`);
});
