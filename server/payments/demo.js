/* ==========================================================================
   Test mode — used until Stripe or SumUp keys are added.
   No money moves: the checkout shows a "Complete test payment" button.
   It is switched off automatically when NODE_ENV=production.
   ========================================================================== */
export function createDemoProvider() {
  return {
    name: 'demo',
    label: 'Test mode',
    async createPayment(order) {
      return { reference: `demo_${order.id}`, next: { type: 'demo' } };
    },
    async verify(order) {
      return order.status === 'paid' ? 'paid' : 'pending';
    },
  };
}
