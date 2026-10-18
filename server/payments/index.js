/* ==========================================================================
   Picks the payment provider from .env:
     PAYMENT_PROVIDER=stripe | sumup | demo
   If PAYMENT_PROVIDER is empty: Stripe if its key is set, else SumUp if its
   key is set, else test mode ("demo", local only — never in production).
   ========================================================================== */
import { createDemoProvider } from './demo.js';
import { createStripeProvider } from './stripe.js';
import { createSumUpProvider } from './sumup.js';

export function selectProvider({ env, isProd, brand }) {
  const choice = (env.PAYMENT_PROVIDER || '').trim().toLowerCase()
    || (env.STRIPE_SECRET_KEY ? 'stripe' : env.SUMUP_API_KEY ? 'sumup' : 'demo');

  if (choice === 'stripe') {
    if (!env.STRIPE_SECRET_KEY) throw new Error('PAYMENT_PROVIDER=stripe needs STRIPE_SECRET_KEY in .env');
    if (!env.STRIPE_WEBHOOK_SECRET) console.warn('[stripe] STRIPE_WEBHOOK_SECRET is not set: payments are still confirmed on the confirmation page, but set up the webhook before going live.');
    const provider = createStripeProvider({ secretKey: env.STRIPE_SECRET_KEY, webhookSecret: env.STRIPE_WEBHOOK_SECRET, brand });
    provider.testMode = /^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY);
    return provider;
  }

  if (choice === 'sumup') {
    if (!env.SUMUP_API_KEY || !env.SUMUP_MERCHANT_CODE) throw new Error('PAYMENT_PROVIDER=sumup needs SUMUP_API_KEY and SUMUP_MERCHANT_CODE in .env');
    const provider = createSumUpProvider({ apiKey: env.SUMUP_API_KEY, merchantCode: env.SUMUP_MERCHANT_CODE, brand });
    provider.testMode = env.SUMUP_SANDBOX === '1';
    return provider;
  }

  if (choice === 'demo') {
    if (isProd) {
      console.warn('[payments] No Stripe or SumUp keys and NODE_ENV=production: online booking is switched off.');
      return null;
    }
    return createDemoProvider();
  }

  throw new Error(`Unknown PAYMENT_PROVIDER "${choice}". Use stripe, sumup or demo.`);
}
