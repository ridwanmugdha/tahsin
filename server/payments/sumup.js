/* ==========================================================================
   SumUp — Checkouts API + SumUp Payment Widget.
   The server creates a checkout; the widget (loaded from gateway.sumup.com)
   takes the card details on the checkout page, so they never touch this server.
   SumUp webhooks are unsigned, so a payment only counts once SumUp's own API
   says the checkout is PAID.
   ========================================================================== */
import { describeOrder } from './describe.js';

const API = 'https://api.sumup.com/v0.1';

export function createSumUpProvider({ apiKey, merchantCode, brand }) {
  async function call(method, path, body) {
    const response = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON error page */ }
    if (!response.ok) {
      const detail = data?.detail || data?.message || data?.error_message || (Array.isArray(data) ? data.map((e) => e.message).join('; ') : '') || text.slice(0, 200);
      throw new Error(`SumUp ${response.status}: ${detail}`);
    }
    return data;
  }

  // SumUp checkout status (PENDING / PAID / FAILED / EXPIRED) -> our order status.
  const statusOf = (checkout) => ({ PAID: 'paid', FAILED: 'failed', EXPIRED: 'expired' }[checkout?.status] || 'pending');

  return {
    name: 'sumup',
    label: 'SumUp',

    async createPayment(order, { baseUrl }) {
      const back = new URLSearchParams({ order: order.id, token: order.token });
      const amount = (order.total / 100).toFixed(2); // SumUp takes major units: 29.00, not 2900
      const checkout = await call('POST', '/checkouts', {
        checkout_reference: order.id,
        amount: Number(amount),
        currency: order.currency.toUpperCase(),
        merchant_code: merchantCode,
        description: describeOrder(order, brand),
        // Where the browser returns after 3-D Secure or other redirect-based payment methods.
        redirect_url: `${baseUrl}/confirmation.html?${back}`,
        // Webhook: SumUp can only reach a public https address, so it is skipped on localhost.
        ...(baseUrl.startsWith('https://') ? { return_url: `${baseUrl}/api/webhooks/sumup` } : {}),
        valid_until: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });
      return {
        reference: checkout.id,
        next: { type: 'sumup', checkoutId: checkout.id, amount, currency: order.currency.toUpperCase(), email: order.customer.email },
      };
    },

    async verify(order) {
      return statusOf(await call('GET', `/checkouts/${encodeURIComponent(order.payment.reference)}`));
    },
  };
}
