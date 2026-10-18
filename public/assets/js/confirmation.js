/* ==========================================================================
   Eterna · booking confirmation
   Asks the server for the order's real status (the server double-checks with
   Stripe/SumUp), waits briefly while a payment is still processing, then
   shows the itinerary. The bag is emptied once the booking is paid.
   ========================================================================== */
(() => {
  'use strict';

  const root = document.querySelector('[data-confirmation]');
  const params = new URLSearchParams(window.location.search);
  const id = params.get('order');
  const token = params.get('token');
  const POLL_MS = 2500;
  const MAX_POLLS = 12;

  const euro = (cents) => new Intl.NumberFormat('en-IE', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: cents % 100 ? 2 : 0,
  }).format(cents / 100);
  const formatDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;

  function render(html) {
    root.innerHTML = `<div class="cf-card">${html}</div>`;
  }

  function renderMessage({ seal, sealIcon, title, text, actions = '' }) {
    render(`
      <span class="cf-seal ${seal}" aria-hidden="true">${icon(sealIcon)}</span>
      <h1 class="cf-title">${title}</h1>
      <p class="cf-text">${text}</p>
      ${actions ? `<div class="cf-actions">${actions}</div>` : ''}`);
  }

  function itemHtml(item) {
    const when = item.parts
      ? item.parts.map((p) => `<li>${icon('calendar')}<span><strong>${esc(p.name)}</strong>: ${esc(formatDate(p.date))} at ${esc(p.time)}</span></li>`).join('')
      : `<li>${icon('calendar')}<span>${esc(formatDate(item.date))} at <strong>${esc(item.time)}</strong></span></li>`;
    const guests = [plural(item.adults, 'adult', 'adults'), item.children ? plural(item.children, 'child', 'children') : ''].filter(Boolean).join(' · ');
    const names = item.guests?.length ? ` · ${item.guests.map(esc).join(', ')}` : '';
    return `
      <article class="cf-item">
        <h3 class="cf-item-name">${esc(item.name)}</h3>
        <p class="cf-item-price">${euro(item.lineTotal)}</p>
        <ul class="cf-item-when">${when}</ul>
        <p class="cf-item-guests">${guests}${names} · ${esc(item.cancellation)}</p>
      </article>`;
  }

  function renderPaid(order) {
    window.EternaBag?.clear();
    try { sessionStorage.removeItem('eterna.checkout.customer'); } catch { /* storage blocked */ }
    document.title = `Booking ${order.ref} confirmed · Eterna`;
    render(`
      <span class="cf-seal" aria-hidden="true">${icon('check')}</span>
      <p class="kicker cf-kicker"><span class="kicker-rule" aria-hidden="true"></span>Booking confirmed</p>
      <h1 class="cf-title">Grazie, ${esc(order.customer.firstName)}. <em>Rome is waiting.</em></h1>
      <p class="cf-text">Your payment went through and your visit is booked. Your mobile tickets and meeting-point details will be emailed to <strong>${esc(order.customer.email)}</strong>.</p>
      <p class="cf-ref"><span>Booking reference</span><strong>${esc(order.ref)}</strong></p>

      <h2 class="cf-section-title">Your itinerary</h2>
      <div class="cf-items">${order.items.map(itemHtml).join('')}</div>
      <p class="cf-total"><span>Total paid</span><strong>${euro(order.total)}</strong></p>

      <h2 class="cf-section-title">Before you go</h2>
      <div class="cf-next">
        <div class="cf-tip">${icon('id')}<h3>Bring photo ID</h3><p>Colosseum and Vatican tickets carry each visitor’s name and are checked at the entrance.</p></div>
        <div class="cf-tip">${icon('shirt')}<h3>Cover shoulders and knees</h3><p>Required at the Vatican Museums and St. Peter’s Basilica. A light scarf solves it.</p></div>
        <div class="cf-tip">${icon('clock')}<h3>Arrive early</h3><p>15 minutes for the Colosseum and St. Peter’s, 30 minutes for Vatican tours: security can be slow.</p></div>
      </div>

      <div class="cf-actions">
        <a class="btn btn-primary" href="./">Back to Eterna ${icon('arrow')}</a>
        <button class="btn btn-quiet" type="button" data-print>Print this page</button>
      </div>`);
    root.querySelector('[data-print]').addEventListener('click', () => window.print());
  }

  async function fetchOrder() {
    const query = new URLSearchParams({ token });
    const response = await fetch(`/api/orders/${encodeURIComponent(id)}?${query}`, { cache: 'no-store' });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function start(attempt = 0) {
    if (!id || !token) {
      renderMessage({
        seal: 'cf-seal--failed', sealIcon: 'info', title: 'We can’t find that booking',
        text: 'This link is missing its booking details. If you paid, check your email or contact us at sayedtahsinhossain@gmail.com.',
        actions: `<a class="btn btn-primary" href="./">Back to Eterna</a>`,
      });
      return;
    }
    let order;
    try {
      order = await fetchOrder();
    } catch {
      if (attempt < MAX_POLLS) { setTimeout(() => start(attempt + 1), POLL_MS); return; }
      renderMessage({
        seal: 'cf-seal--failed', sealIcon: 'info', title: 'We couldn’t check your booking',
        text: 'Please refresh this page in a moment. Don’t pay again: if your payment went through, your booking is safe.',
      });
      return;
    }
    if (!order) {
      renderMessage({
        seal: 'cf-seal--failed', sealIcon: 'info', title: 'We can’t find that booking',
        text: 'Please contact us at sayedtahsinhossain@gmail.com with your email address and we’ll look it up.',
        actions: `<a class="btn btn-primary" href="./">Back to Eterna</a>`,
      });
      return;
    }

    if (order.status === 'paid') {
      renderPaid(order);
    } else if (order.status === 'pending') {
      if (attempt < MAX_POLLS) {
        renderMessage({
          seal: 'cf-seal--pending', sealIcon: 'clock', title: 'Confirming your payment…',
          text: 'This usually takes a few seconds. Please keep this page open.',
        });
        setTimeout(() => start(attempt + 1), POLL_MS);
      } else {
        renderMessage({
          seal: 'cf-seal--pending', sealIcon: 'clock', title: 'Your payment is still processing',
          text: `Some payment methods take longer to confirm. Your booking reference is <strong>${esc(order.ref)}</strong>. We’ll email ${esc(order.customer.email)} as soon as it’s confirmed. Please don’t pay again.`,
          actions: `<a class="btn btn-quiet" href="${esc(window.location.href)}">Check again</a>`,
        });
      }
    } else {
      renderMessage({
        seal: 'cf-seal--failed', sealIcon: 'close', title: 'The payment didn’t go through',
        text: 'Nothing was charged. Your bag is still saved, so you can try again with the same or a different card.',
        actions: `<a class="btn btn-primary" href="checkout.html">Back to checkout ${icon('arrow')}</a>`,
      });
    }
  }

  start();
})();
