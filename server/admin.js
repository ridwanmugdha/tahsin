/* ==========================================================================
   /admin — a simple, password-protected list of bookings so the business can
   see who booked what (guest names, dates, times) and fulfil the tickets.
   Log in with any username and the ADMIN_PASSWORD from .env.
   ========================================================================== */
import { createHash, timingSafeEqual } from 'node:crypto';

const sha = (value) => createHash('sha256').update(value).digest();

export function adminAuth(password) {
  return (req, res, next) => {
    if (!password) return res.status(404).send('Not found');
    const [scheme, encoded] = (req.headers.authorization || '').split(' ');
    const given = scheme === 'Basic' && encoded ? Buffer.from(encoded, 'base64').toString().split(':').slice(1).join(':') : '';
    if (given && timingSafeEqual(sha(given), sha(password))) return next();
    res.set('WWW-Authenticate', 'Basic realm="Bookings", charset="UTF-8"').status(401).send('Login required');
  };
}

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const euro = (cents) => `€${(cents / 100).toFixed(2)}`;
const when = (date, time) => `${esc(date)} ${esc(time)}`;

function itemHtml(item) {
  const schedule = item.parts
    ? item.parts.map((p) => `<div>${esc(p.name)} — <b>${when(p.date, p.time)}</b></div>`).join('')
    : `<div><b>${when(item.date, item.time)}</b></div>`;
  const guests = item.guests?.length ? `<div class="muted">${item.guests.map(esc).join(', ')}</div>` : '';
  return `<div class="item"><div>${esc(item.name)} · ${item.adults} adult(s)${item.children ? `, ${item.children} child(ren)` : ''} · ${euro(item.lineTotal)}</div>${schedule}${guests}</div>`;
}

export function renderAdmin(orders, brand) {
  const rows = orders.map((o) => `
    <tr class="s-${esc(o.status)}">
      <td><b>${esc(o.ref)}</b><div class="muted">${esc(o.createdAt.slice(0, 16).replace('T', ' '))} UTC</div></td>
      <td><span class="status">${esc(o.status)}</span><div class="muted">${esc(o.payment?.provider)} ${esc(o.payment?.reference || '')}</div></td>
      <td>${esc(o.customer.firstName)} ${esc(o.customer.lastName)}<div class="muted"><a href="mailto:${esc(o.customer.email)}">${esc(o.customer.email)}</a><br>${esc(o.customer.phone)} · ${esc(o.customer.country)}</div></td>
      <td>${o.items.map(itemHtml).join('')}</td>
      <td class="num">${euro(o.total)}</td>
    </tr>`).join('');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(brand)} · Bookings</title><meta name="robots" content="noindex">
<style>
  body{margin:0;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;background:#F4EEE4;color:#1C1714}
  main{max-width:1280px;margin:0 auto;padding:32px 16px}
  h1{font:400 32px/1.1 Georgia,serif;margin:0 0 4px}
  p.lede{margin:0 0 24px;color:#5F534A}
  .wrap{overflow-x:auto;background:#FBF8F2;border:1px solid #DCCFBB;border-radius:14px}
  table{width:100%;border-collapse:collapse;min-width:900px}
  th,td{padding:12px 14px;text-align:left;vertical-align:top;border-bottom:1px solid #ECE3D5}
  th{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#5F534A}
  .muted{color:#5F534A;font-size:12px}
  .item+.item{margin-top:10px;padding-top:10px;border-top:1px dashed #DCCFBB}
  .num{text-align:right;white-space:nowrap;font-weight:600}
  .status{display:inline-block;padding:2px 8px;border-radius:99px;background:#ECE3D5;font-size:12px;font-weight:600;text-transform:capitalize}
  .s-paid .status{background:#DDEBD9;color:#25562A}
  .s-failed .status,.s-expired .status{background:#F6E7DE;color:#8B3420}
  a{color:#8B3420}
</style></head><body><main>
<h1>Bookings</h1>
<p class="lede">${orders.filter((o) => o.status === 'paid').length} paid · ${orders.length} total. Newest first. Paid bookings need tickets sent to the customer.</p>
<div class="wrap"><table>
<thead><tr><th>Booking</th><th>Status</th><th>Customer</th><th>Experiences, times &amp; visitor names</th><th class="num">Total</th></tr></thead>
<tbody>${rows || '<tr><td colspan="5">No bookings yet.</td></tr>'}</tbody>
</table></div></main></body></html>`;
}
