/* ==========================================================================
   Stripe — hosted Stripe Checkout (customer is redirected to a Stripe page).
   Card details never touch this server. Apple Pay, Google Pay and the other
   payment methods you switch on in the Stripe Dashboard appear automatically.
   ========================================================================== */
import Stripe from 'stripe';
import { describeWhen } from './describe.js';

export function createStripeProvider({ secretKey, webhookSecret, brand }) {
  const stripe = new Stripe(secretKey);

  // A Stripe Checkout Session -> our order status.
  function statusOf(session) {
    if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') return 'paid';
    if (session.status === 'expired') return 'expired';
    return 'pending';
  }

  return {
    name: 'stripe',
    label: 'Stripe',

    async createPayment(order, { baseUrl }) {
      const lineItems = order.items.flatMap((item) => {
        const description = describeWhen(item);
        const line = (label, unit, quantity) => ({
          quantity,
          price_data: {
            currency: order.currency,
            unit_amount: unit,
            product_data: { name: `${item.name} (${label})`, description },
          },
        });
        return [
          item.adults ? line('Adult', item.unitAdult, item.adults) : null,
          item.children ? line('Child', item.unitChild, item.children) : null,
        ].filter(Boolean);
      });

      const params = new URLSearchParams({ order: order.id, token: order.token });
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        submit_type: 'book', // the pay button reads "Book"
        line_items: lineItems,
        customer_email: order.customer.email,
        client_reference_id: order.id,
        locale: 'auto',
        metadata: { order_id: order.id, order_ref: order.ref },
        payment_intent_data: {
          description: `${brand} booking ${order.ref}`,
          metadata: { order_id: order.id, order_ref: order.ref },
        },
        // Stripe replaces {CHECKOUT_SESSION_ID} with the real id on the way back.
        success_url: `${baseUrl}/confirmation.html?${params}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/checkout.html?cancelled=1`,
        expires_at: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour (Stripe allows 30 min – 24 h)
      }, { idempotencyKey: `checkout-${order.id}` });

      return { reference: session.id, next: { type: 'redirect', url: session.url } };
    },

    // Asks Stripe directly, so the confirmation page works even before the webhook arrives.
    async verify(order) {
      const session = await stripe.checkout.sessions.retrieve(order.payment.reference);
      return statusOf(session);
    },

    /** Returns { reference, status } for events we care about, or null. Throws if the signature is wrong. */
    async webhook(req) {
      if (!webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET is not set');
      const event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], webhookSecret);
      const session = event.data.object;
      switch (event.type) {
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded':
          return { reference: session.id, status: statusOf(session) };
        case 'checkout.session.async_payment_failed':
          return { reference: session.id, status: 'failed' };
        case 'checkout.session.expired':
          return { reference: session.id, status: 'expired' };
        default:
          return null;
      }
    },
  };
}
