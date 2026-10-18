// Human-readable "when" for an order line, used in payment descriptions.
const fmt = (iso, time) => {
  const date = new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return `${date}, ${time}`;
};

export function describeWhen(item) {
  if (item.parts) return item.parts.map((p) => `${p.name}: ${fmt(p.date, p.time)}`).join(' · ');
  return fmt(item.date, item.time);
}

export function describeOrder(order, brand) {
  const lines = order.items.map((i) => `${i.name} x${i.adults + i.children}`).join(', ');
  return `${brand} ${order.ref}: ${lines}`.slice(0, 255);
}
