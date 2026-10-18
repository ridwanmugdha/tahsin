# Eterna: Rome tickets website + checkout

Landing page, bag, checkout and booking confirmation for Colosseum, Vatican Museums and St. Peter's Basilica tickets. Payments work with **Stripe** or **SumUp**; you choose one in `.env`. Card details are always entered on Stripe's or SumUp's own secure forms and never touch this server.

```
public/            the website (landing page, checkout.html, confirmation.html, assets)
server.js          the small Node.js server (also what Vercel runs)
server/
  catalog.js       ← prices, child rates, time slots, closed days (edit this)
  booking.js       checks and prices every order
  payments/        stripe.js, sumup.js, demo.js (test mode)
  store.js         where bookings are kept: Postgres if DATABASE_URL is set, else data/orders.json
  admin.js         the /admin bookings list
data/orders.json   bookings when there is no database (created automatically, not uploaded to git)
vercel.json        Vercel settings (Frankfurt region, security headers)
.env.example       settings template
```

## 1. Run it on your computer

You need [Node.js](https://nodejs.org) 22.9 or newer.

```bash
npm install
```

```bash
npm start
```

Open http://localhost:3000. With no keys set, checkout runs in **test mode**: you can book the whole flow and click "Complete test payment". No money moves.

## 2. Switch on Stripe

1. Create a Stripe account. In the Dashboard go to **Developers → API keys** and copy the **secret key** (`sk_test_…`).
2. Copy `.env.example` to `.env` and set `STRIPE_SECRET_KEY=sk_test_…`. Restart `npm start`.
3. Book something and pay with the test card `4242 4242 4242 4242`, any future date, any CVC.
4. **Webhook** (needed when live, so a payment counts even if the customer closes the tab):
   - Live: in **Workbench → Webhooks** add the endpoint `https://YOUR-SITE/api/webhooks/stripe` with the events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` and `checkout.session.expired`. Put its signing secret in `STRIPE_WEBHOOK_SECRET`.
   - On your computer (optional): install the Stripe CLI and run `stripe listen --forward-to localhost:3000/api/webhooks/stripe`, then copy the `whsec_…` it prints into `.env`.
5. Apple Pay works automatically on Stripe's checkout page; switch on Google Pay and other methods under **Settings → Payment methods**.
6. To go live, swap in the `sk_live_…` key and the live webhook secret.

Tip: under **Settings → Customer emails** Stripe can email customers a receipt automatically.

## 3. Or switch on SumUp

1. In SumUp go to **Settings → For developers → Toolkit → API keys** and create a key (it is shown only once).
2. In `.env` set `PAYMENT_PROVIDER=sumup`, `SUMUP_API_KEY=…` and `SUMUP_MERCHANT_CODE=…` (your merchant code from your SumUp profile). Restart.
3. To test without real money, create a **sandbox merchant** at https://me.sumup.com/settings/developer?tab=sandboxes, use that account's API key, and set `SUMUP_SANDBOX=1`. Test card: `4200 0000 0000 0091`, any future date, any CVC.
4. The card form appears right on the checkout page (SumUp Payment Widget). SumUp's payment notifications reach the server automatically once the site runs on `https://` with `PUBLIC_URL` set.
5. Apple Pay / Google Pay through SumUp need extra setup with SumUp (domain registration in the dashboard and a request to their support).

## Host it online (Vercel)

Real bookings need the server running on an `https://` address. On [Vercel](https://vercel.com), `server.js` runs as one serverless function, the `public/` folder is served by Vercel's CDN, and bookings go into a **Neon Postgres** database. Vercel can't keep files between requests, so `data/orders.json` doesn't work there. Your keys are never in the repo: you type them into Vercel.

Vercel's free **Hobby** plan is for personal, non-commercial use. It's fine for testing; move the project to **Pro** before taking real customers' money.

1. Sign in at https://vercel.com with GitHub. Click **Add New → Project** and import `ridwanmugdha/tahsin`. Vercel detects **Express**; leave the build settings as they are.
2. Before clicking **Deploy**, open **Environment Variables** and add:
   - `NODE_ENV` = `production`
   - `TRUST_PROXY` = `1`
   - `PAYMENT_PROVIDER` = `stripe`
   - `STRIPE_SECRET_KEY` = your `sk_test_…` key for now
   - `ADMIN_PASSWORD` = a long password for `/admin`

   Click **Deploy**. When it's done, note the address under **Domains** (e.g. `https://tahsin.vercel.app`). Use that one, not the long per-deployment address: those can ask for a Vercel login, and Stripe can't get past it. Checkout says "Online booking opens soon" until the database is connected (step 3).
3. **Database**: in the project open **Storage → Create Database → Neon** (Postgres), pick the free plan and the **Frankfurt** region (next to the `fra1` functions in `vercel.json`), and connect it to the project. Leave the environment variable prefix empty, so it adds `DATABASE_URL`. The bookings table is created by itself on the first booking.
4. Under **Settings → Environment Variables**, add `PUBLIC_URL` = the address from step 2 (no slash at the end).
5. **Stripe webhook**: in the Stripe Dashboard go to **Developers → Webhooks → Add destination**, endpoint URL `https://YOUR-ADDRESS/api/webhooks/stripe`, events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` and `checkout.session.expired`. Copy its signing secret (`whsec_…`) into `STRIPE_WEBHOOK_SECRET` on Vercel.
6. Environment variable changes only apply to new deployments: open **Deployments**, click **⋯** on the latest one and choose **Redeploy**.
7. **Test it**: book something on the live address and pay with `4242 4242 4242 4242`, any future date, any CVC. You should end on the confirmation page with the booking paid, see it in `/admin`, and see the event delivered with status `200` under the webhook in Stripe.

Good to know:

- Every push to `main` deploys the site; pushes to other branches get their own preview address.
- To look at or copy the bookings, open the database from Vercel's **Storage** tab and run `SELECT data FROM orders ORDER BY created_at DESC` in Neon's SQL editor.
- **Going live**: Stripe's test and live modes have separate keys and separate webhooks. Create the webhook again in live mode, put `sk_live_…` and the live `whsec_…` into Vercel, and redeploy.
- **Own domain** (e.g. `www.eterna-tickets.com`): add it under **Settings → Domains** and set the DNS records Vercel shows. Then change `PUBLIC_URL` and the Stripe webhook URL to the new address.
- **SumUp instead of Stripe**: set `PAYMENT_PROVIDER=sumup`, `SUMUP_API_KEY` and `SUMUP_MERCHANT_CODE` instead.
- Other hosts (Render, Railway, Fly.io, a VPS) work too: run `npm ci` and `npm start` with the same settings, and either set `DATABASE_URL` or put `DATA_DIR` on a persistent disk.

## Preview on GitHub Pages

Every push to `main` that changes `public/` publishes the website to https://ridwanmugdha.github.io/tahsin/ (`.github/workflows/pages.yml`; in the repo's **Settings → Pages**, Source must be **GitHub Actions**). Pages only hosts files, so the landing page and bag work there but checkout shows "Online booking isn't live here yet". Real bookings go through the Node server (see "Host it online" above).

## 4. See your bookings

Set `ADMIN_PASSWORD` in `.env`, then open `/admin` (any username + that password). It lists every booking with status, customer, dates, times and visitor names. **Tickets are not bought or emailed automatically**: for each paid booking, buy the venue tickets / arrange the guide and email the customer their vouchers.

## 5. Before going live

- [ ] Set real prices, and especially **child prices** (they are placeholders) in `server/catalog.js`.
- [ ] Match the **time slots** in `server/catalog.js` to what your suppliers can deliver.
- [ ] Replace the brand name "Eterna" (search for `BRAND:` in the HTML).
- [ ] Replace the **sample reviews** on the landing page with real ones.
- [ ] Write real **Terms, Privacy and Cancellation** pages (the links are placeholders now).
- [ ] Keep "Licensed local guides" only if every guide holds a valid licence.
- [ ] Host it with a database for the bookings (Vercel + Neon, see "Host it online" above), or on a Node host with a **persistent disk** for `data/orders.json` (and back that file up).
- [ ] On the live server set `NODE_ENV=production`, `PUBLIC_URL=https://…`, `TRUST_PROXY=1` (if behind a proxy) and your live keys.
- [ ] Photos are loaded from Unsplash (free licence). Consider downloading them into `public/assets/img/`.

## How payment confirmation works

1. Checkout sends the choices to `POST /api/orders`. The server checks dates, times, closures and names, **calculates the price itself** from `catalog.js`, saves the order as `pending` and creates the payment.
2. Stripe: the customer is sent to Stripe's page and back to `confirmation.html`. SumUp: the card form is shown on the checkout page.
3. An order only becomes `paid` after the server asks Stripe/SumUp directly (on the confirmation page and through webhooks), so a faked "success" in the browser can't mark an order as paid.
