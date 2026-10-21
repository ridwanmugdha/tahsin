/* ==========================================================================
   HTML for the admin pages: the login form and the panel (sidebar, top bar,
   overview, bookings, availability & prices, and "coming soon" sections).
   Styles and scripts live in public/assets/admin/.
   ========================================================================== */
import { addDays } from '../booking.js';

export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const euro = (cents) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
const longDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const guestsOf = (item) => (item.adults || 0) + (item.children || 0);

/* --------------------------------------------------------------------------
   Navigation
   -------------------------------------------------------------------------- */
const NAV = [
  { href: '/admin', key: 'overview', label: 'Overview', icon: 'grid' },
  { href: '/admin/bookings', key: 'bookings', label: 'Bookings', icon: 'ticket' },
  { href: '/admin/availability', key: 'availability', label: 'Availability & prices', icon: 'calendar' },
];

/** Sections shown in the sidebar that aren't built yet. */
export const SOON = {
  customers: { label: 'Customers', icon: 'users', text: 'Every traveller in one place, with their bookings, contact details and notes.' },
  products: { label: 'Products', icon: 'tag', text: 'Add experiences, edit descriptions and photos, and set standard prices and time slots.' },
  discounts: { label: 'Discount codes', icon: 'percent', text: 'Create promo codes for partners, hotels and returning customers.' },
  reviews: { label: 'Reviews', icon: 'star', text: 'Collect reviews after each visit and choose which ones appear on the website.' },
  reports: { label: 'Reports', icon: 'chart', text: 'Sales by experience, month and country, ready to export for your accountant.' },
  payouts: { label: 'Payouts', icon: 'wallet', text: 'Follow payments from Stripe or SumUp to your bank account.' },
  team: { label: 'Team', icon: 'shield', text: 'Invite staff and guides, each with their own login and permissions.' },
  settings: { label: 'Settings', icon: 'cog', text: 'Business details, emails to customers, booking rules and payment settings.' },
};

const ICONS = {
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  ticket: '<path d="M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4z"/><path d="M14.5 6.5v2M14.5 11v2M14.5 15.5v2"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>',
  tag: '<path d="M3.5 12.5V4.5a1 1 0 0 1 1-1h8l8 8-9 9z"/><circle cx="8" cy="8" r="1.5"/>',
  percent: '<path d="M18.5 5.5l-13 13"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  chart: '<path d="M3 20.5h18M6 17v-6M11 17V6M16 17v-8"/>',
  wallet: '<path d="M4 7.5a2 2 0 0 1 2-2h11.5v3"/><path d="M4 7.5V18a2 2 0 0 0 2 2h14V8.5H6a2 2 0 0 1-2-1z"/><circle cx="16" cy="14.2" r="1.1"/>',
  shield: '<path d="M12 3.5 5 6.2v5.6c0 4.2 3 7.6 7 8.7 4-1.1 7-4.5 7-8.7V6.2z"/><path d="m9.2 12 2 2 3.8-3.8"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
  logout: '<path d="M9.5 20.5H6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h3.5M15.5 16.5 20 12l-4.5-4.5M20 12H9.5"/>',
  external: '<path d="M14 4h6v6M20 4l-8.5 8.5M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  left: '<path d="m14.5 18-6-6 6-6"/>',
  right: '<path d="m9.5 18 6-6-6-6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
};

const SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${Object.entries(ICONS)
  .map(([name, body]) => `<symbol id="a-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</symbol>`)
  .join('')}</svg>`;

export const icon = (name, className = 'a-icon') => `<svg class="${className}" aria-hidden="true"><use href="#a-${name}"/></svg>`;

const HEAD = (title, brand) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${esc(brand)} Admin</title><meta name="robots" content="noindex, nofollow">
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..600&amp;family=Inter+Tight:wght@400;500;600&amp;display=swap">
<link rel="stylesheet" href="/assets/admin/admin.css">
</head>`;

function navLink({ href, label, icon: name }, current, soon = false) {
  return `<li><a class="a-nav-link" href="${href}"${current ? ' aria-current="page"' : ''}>${icon(name)}<span>${esc(label)}</span>${soon ? '<span class="a-soon">Soon</span>' : ''}</a></li>`;
}

function layout({ brand, username, active, title, lede = '', body, scripts = '' }) {
  const soonLinks = Object.entries(SOON).map(([key, s]) => navLink({ href: `/admin/${key}`, ...s }, active === key, true)).join('');
  const initials = esc(username.replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase() || 'A');
  return `${HEAD(title, brand)}<body class="a-body">${SPRITE}
<div class="a-shell">
  <aside class="a-side" id="a-side" data-side>
    <div class="a-side-head">
      <a class="a-brand" href="/admin"><img src="/assets/img/favicon.svg" alt="" width="32" height="32"><span>${esc(brand)}<small>Admin</small></span></a>
      <button class="a-icon-btn a-side-close" type="button" data-side-close aria-label="Close menu">${icon('close')}</button>
    </div>
    <nav class="a-nav" aria-label="Admin">
      <p class="a-nav-label">Manage</p>
      <ul>${NAV.map((n) => navLink(n, active === n.key)).join('')}</ul>
      <p class="a-nav-label">Coming soon</p>
      <ul>${soonLinks}</ul>
    </nav>
    <a class="a-side-foot" href="/" target="_blank" rel="noopener">${icon('external')}<span>View website</span></a>
  </aside>
  <div class="a-scrim" data-side-close></div>
  <div class="a-main">
    <header class="a-top">
      <button class="a-icon-btn a-menu" type="button" data-side-open aria-controls="a-side" aria-expanded="false" aria-label="Open menu">${icon('menu')}</button>
      <div class="a-top-title"><h1>${esc(title)}</h1>${lede ? `<p>${lede}</p>` : ''}</div>
      <div class="a-user">
        <span class="a-avatar" aria-hidden="true">${initials}</span>
        <span class="a-user-name">${esc(username)}</span>
        <form method="post" action="/admin/logout"><button class="a-icon-btn" type="submit" aria-label="Sign out" title="Sign out">${icon('logout')}</button></form>
      </div>
    </header>
    <main class="a-content">${body}</main>
  </div>
</div>
<script src="/assets/admin/admin.js" defer></script>${scripts}
</body></html>`;
}

/* --------------------------------------------------------------------------
   Login
   -------------------------------------------------------------------------- */
export function renderLogin({ brand, error = '', username = '', next = '' }) {
  return `${HEAD('Sign in', brand)}<body class="a-body a-login-body">
<main class="a-login">
  <div class="a-login-card">
    <a class="a-brand a-brand--dark" href="/"><img src="/assets/img/favicon.svg" alt="" width="36" height="36"><span>${esc(brand)}<small>Admin</small></span></a>
    <h1>Sign in</h1>
    <p class="a-muted">Manage bookings, ticket availability and prices.</p>
    ${error ? `<p class="a-alert" role="alert">${esc(error)}</p>` : ''}
    <form method="post" action="/admin/login" class="a-form">
      <input type="hidden" name="next" value="${esc(next)}">
      <div class="a-field"><label for="login-user">Admin ID</label>
        <input id="login-user" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required value="${esc(username)}"${username ? '' : ' autofocus'}></div>
      <div class="a-field"><label for="login-pass">Password</label>
        <input id="login-pass" name="password" type="password" autocomplete="current-password" required${username ? ' autofocus' : ''}></div>
      <button class="a-btn a-btn--primary a-btn--block" type="submit">Sign in</button>
    </form>
  </div>
  <p class="a-login-foot"><a href="/">← Back to the website</a></p>
</main>
</body></html>`;
}

/* --------------------------------------------------------------------------
   Bookings
   -------------------------------------------------------------------------- */
const when = (date, time) => `${esc(date)} ${esc(time)}`;

function itemHtml(item) {
  const schedule = item.parts
    ? item.parts.map((p) => `<div>${esc(p.name)} — <b>${when(p.date, p.time)}</b></div>`).join('')
    : `<div><b>${when(item.date, item.time)}</b></div>`;
  const guests = item.guests?.length ? `<div class="a-muted">${item.guests.map(esc).join(', ')}</div>` : '';
  return `<div class="a-item"><div>${esc(item.name)} · ${item.adults} adult(s)${item.children ? `, ${item.children} child(ren)` : ''} · ${euro(item.lineTotal)}</div>${schedule}${guests}</div>`;
}

const statusPill = (status) => `<span class="a-status a-status--${esc(status)}">${esc(status)}</span>`;

function bookingsTable(orders) {
  const rows = orders.map((o) => `
    <tr>
      <td class="a-nowrap"><b>${esc(o.ref)}</b><div class="a-muted">${esc(o.createdAt.slice(0, 16).replace('T', ' '))} UTC</div></td>
      <td>${statusPill(o.status)}<div class="a-muted a-ref">${esc(o.payment?.provider)} ${esc(o.payment?.reference || '')}</div></td>
      <td>${esc(o.customer.firstName)} ${esc(o.customer.lastName)}<div class="a-muted"><a href="mailto:${esc(o.customer.email)}">${esc(o.customer.email)}</a><br>${esc(o.customer.phone)} · ${esc(o.customer.country)}</div></td>
      <td>${o.items.map(itemHtml).join('')}</td>
      <td class="a-num">${euro(o.total)}</td>
    </tr>`).join('');
  return `<div class="a-card a-table-wrap"><table class="a-table a-table--wide">
<thead><tr><th>Booking</th><th>Status</th><th>Customer</th><th>Experiences, times &amp; visitor names</th><th class="a-num">Total</th></tr></thead>
<tbody>${rows || '<tr><td colspan="5" class="a-empty">No bookings yet.</td></tr>'}</tbody>
</table></div>`;
}

export function renderBookings({ brand, username, orders }) {
  const paid = orders.filter((o) => o.status === 'paid').length;
  return layout({
    brand, username, active: 'bookings', title: 'Bookings',
    lede: `${paid} paid · ${orders.length} total. Newest first. Paid bookings need tickets sent to the customer.`,
    body: bookingsTable(orders),
  });
}

/* --------------------------------------------------------------------------
   Overview
   -------------------------------------------------------------------------- */
export function renderOverview({ brand, username, orders, today }) {
  const paid = orders.filter((o) => o.status === 'paid');
  const revenue = paid.reduce((sum, o) => sum + o.total, 0);
  const weekEnd = addDays(today, 6);
  const visits = paid.flatMap((o) => o.items.flatMap((item) => (item.parts || [item])
    .filter((v) => v.date >= today && v.date <= weekEnd)
    .map((v) => ({ ...v, guests: guestsOf(item), order: o }))))
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const visitors = visits.reduce((sum, v) => sum + v.guests, 0);

  const tile = (label, value, note) => `<div class="a-card a-stat"><p class="a-stat-label">${label}</p><p class="a-stat-value">${value}</p><p class="a-stat-note">${note}</p></div>`;
  const visitRows = visits.slice(0, 12).map((v) => `<tr>
      <td><b>${esc(longDate(v.date))}</b><div class="a-muted">${esc(v.time)}</div></td>
      <td>${esc(v.name)}</td>
      <td>${esc(v.order.customer.firstName)} ${esc(v.order.customer.lastName)}<div class="a-muted">${esc(v.order.ref)}</div></td>
      <td class="a-num">${v.guests}</td></tr>`).join('');
  const latestRows = orders.slice(0, 6).map((o) => `<tr>
      <td><b>${esc(o.ref)}</b><div class="a-muted">${esc(o.customer.firstName)} ${esc(o.customer.lastName)}</div></td>
      <td>${statusPill(o.status)}</td>
      <td class="a-num">${euro(o.total)}</td></tr>`).join('');

  const greeting = `Buongiorno, ${esc(username)}`;
  return layout({
    brand, username, active: 'overview', title: 'Overview',
    lede: `${greeting}. Here’s how bookings look today, ${esc(longDate(today))}.`,
    body: `
<section class="a-stats" aria-label="Key numbers">
  ${tile('Paid bookings', paid.length, 'All time')}
  ${tile('Revenue', euro(revenue), 'From paid bookings')}
  ${tile('Visitors next 7 days', visitors, plural(visits.length, 'visit', 'visits'))}
  ${tile('Awaiting payment', orders.filter((o) => o.status === 'pending').length, 'Unpaid orders are released after 1 hour')}
</section>
<div class="a-cols">
  <section class="a-card">
    <div class="a-card-head"><h2>Upcoming visits</h2><span class="a-muted">Next 7 days</span></div>
    <div class="a-table-wrap"><table class="a-table">
      <thead><tr><th>When</th><th>Experience</th><th>Lead traveller</th><th class="a-num">Guests</th></tr></thead>
      <tbody>${visitRows || '<tr><td colspan="4" class="a-empty">No paid visits in the next 7 days.</td></tr>'}</tbody>
    </table></div>
  </section>
  <section class="a-card">
    <div class="a-card-head"><h2>Latest bookings</h2><a class="a-link" href="/admin/bookings">All bookings ${icon('arrow')}</a></div>
    <div class="a-table-wrap"><table class="a-table">
      <thead><tr><th>Booking</th><th>Status</th><th class="a-num">Total</th></tr></thead>
      <tbody>${latestRows || '<tr><td colspan="3" class="a-empty">No bookings yet.</td></tr>'}</tbody>
    </table></div>
  </section>
</div>
<a class="a-card a-callout" href="/admin/availability">
  <span class="a-callout-icon">${icon('calendar')}</span>
  <span><b>Availability &amp; prices</b><span class="a-muted">Set how many tickets you can sell and the price for any date, or close a date.</span></span>
  ${icon('arrow')}
</a>`,
  });
}

/* --------------------------------------------------------------------------
   Availability & prices (the calendar itself is drawn by availability.js)
   -------------------------------------------------------------------------- */
export function renderAvailability({ brand, username, data }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return layout({
    brand, username, active: 'availability', title: 'Availability & prices',
    lede: 'Choose an experience, select days, then set the tickets you can sell and the price for those dates.',
    body: `
<div class="av">
  <div class="a-card av-bar">
    <div class="a-field av-product">
      <label for="av-product">Experience</label>
      <select id="av-product" data-av-product></select>
    </div>
    <div class="av-month">
      <button class="a-icon-btn" type="button" data-av-prev aria-label="Previous month">${icon('left')}</button>
      <h2 data-av-month aria-live="polite"></h2>
      <button class="a-icon-btn" type="button" data-av-next aria-label="Next month">${icon('right')}</button>
    </div>
  </div>

  <div class="av-layout">
    <section class="a-card av-cal" aria-label="Calendar">
      <div class="av-tools">
        <span class="a-muted">Select</span>
        <button class="a-chip" type="button" data-select="all">Whole month</button>
        <button class="a-chip" type="button" data-select="weekdays">Mon–Fri</button>
        <button class="a-chip" type="button" data-select="weekends">Sat–Sun</button>
        <button class="a-chip" type="button" data-select="none">Clear</button>
      </div>
      <div class="av-weekdays" aria-hidden="true"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div>
      <div class="av-grid" data-av-grid></div>
      <ul class="av-legend">
        <li><span class="av-key av-key--custom"></span>Custom price</li>
        <li><span class="av-key av-key--low"></span>5 or fewer left</li>
        <li><span class="av-key av-key--closed"></span>Closed / sold out</li>
      </ul>
    </section>

    <aside class="a-card av-editor" aria-labelledby="ed-title">
      <h2 id="ed-title" data-ed-title>Select days</h2>
      <p class="a-muted" data-ed-sub>Click days on the calendar. Shift-click selects a range.</p>
      <form class="a-form" data-ed-form hidden novalidate>
        <fieldset class="a-seg">
          <legend>Sales</legend>
          <label><input type="radio" name="closed" value="open"><span>Open</span></label>
          <label><input type="radio" name="closed" value="closed"><span>Closed</span></label>
        </fieldset>
        <div class="a-field">
          <label for="ed-capacity">Tickets available</label>
          <input id="ed-capacity" name="capacity" type="number" min="0" max="100000" step="1" inputmode="numeric">
          <p class="a-hint">For the whole day, across all time slots. Leave empty for no limit.</p>
        </div>
        <div class="a-field-row">
          <div class="a-field">
            <label for="ed-adult">Adult price</label>
            <div class="a-money"><span aria-hidden="true">€</span><input id="ed-adult" name="adult" type="number" min="0" step="0.01" inputmode="decimal"></div>
          </div>
          <div class="a-field">
            <label for="ed-child">Child price</label>
            <div class="a-money"><span aria-hidden="true">€</span><input id="ed-child" name="child" type="number" min="0" step="0.01" inputmode="decimal"></div>
          </div>
        </div>
        <p class="a-hint" data-ed-standard></p>
        <p class="av-sold" data-ed-sold></p>
        <p class="a-alert" data-ed-error role="alert" hidden></p>
        <div class="av-actions">
          <button class="a-btn a-btn--primary" type="submit" data-ed-save>Save</button>
          <button class="a-btn a-btn--ghost" type="button" data-ed-reset>Reset to standard</button>
        </div>
        <p class="av-msg" data-ed-msg role="status"></p>
      </form>
      <p class="a-hint av-note">The Eternal Trio combo keeps its own price and uses the tickets and closed days of its three experiences.</p>
    </aside>
  </div>
</div>
<script type="application/json" id="av-data">${json}</script>`,
    scripts: '\n<script src="/assets/admin/availability.js" defer></script>',
  });
}

/* --------------------------------------------------------------------------
   Coming soon
   -------------------------------------------------------------------------- */
export function renderSoon({ brand, username, key }) {
  const section = SOON[key];
  return layout({
    brand, username, active: key, title: section.label,
    body: `<div class="a-card a-soon-page">
  <span class="a-soon-icon">${icon(section.icon)}</span>
  <p class="a-eyebrow">Coming soon</p>
  <h2>${esc(section.label)} is on its way</h2>
  <p class="a-muted">${esc(section.text)}</p>
  <a class="a-btn a-btn--ghost" href="/admin">Back to overview</a>
</div>`,
  });
}
