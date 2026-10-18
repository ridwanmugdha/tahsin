/* ==========================================================================
   Validates a checkout request and prices it from the catalogue.
   Returns { errors } (keyed by field path, for the form) or { draft }.
   ========================================================================== */
import { ATTRACTIONS, BOOKING_RULES, CURRENCY, getProduct } from './catalog.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

const clean = (value, max = 120) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const toInt = (value) => (Number.isInteger(value) ? value : Number.parseInt(value, 10));

/** Today's date (YYYY-MM-DD) and minutes since midnight in Rome. */
export function romeNow(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: BOOKING_RULES.timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now).map((p) => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

const minutesOf = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

function addDays(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isRealDate(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

/** Why a product can't run on this date/time, or '' if it can. */
export function availabilityProblem(product, date, time, now = romeNow()) {
  if (!DATE_RE.test(date || '') || !isRealDate(date)) return 'Choose a date.';
  if (!TIME_RE.test(time || '') || !product.slots.includes(time)) return 'Choose a time.';
  if (date < now.date) return 'That date has passed.';
  if (date > addDays(now.date, BOOKING_RULES.maxDaysAhead)) return 'That date is too far ahead to book yet.';
  if (date === now.date && minutesOf(time) - now.minutes < BOOKING_RULES.cutoffHours * 60) {
    return `This time is too soon. Book at least ${BOOKING_RULES.cutoffHours} hours ahead.`;
  }
  const venue = ATTRACTIONS[product.attraction];
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (venue.closedWeekdays.includes(weekday) || venue.closedDates.includes(date.slice(5))) {
    return `${venue.name} is closed on that date.`;
  }
  return '';
}

export function priceItem(product, adults, children) {
  return adults * product.adult + children * product.child;
}

/**
 * Turns the browser's checkout request into a priced order draft.
 * Nothing from the request is trusted except the choices themselves.
 */
export function buildDraft(body, now = romeNow()) {
  const errors = {};
  const fail = (path, message) => { if (!errors[path]) errors[path] = message; };

  const rawItems = Array.isArray(body?.items) ? body.items : [];
  if (!rawItems.length) fail('items', 'Your bag is empty.');
  if (rawItems.length > BOOKING_RULES.maxItems) fail('items', `You can book up to ${BOOKING_RULES.maxItems} experiences at once.`);

  const items = rawItems.slice(0, BOOKING_RULES.maxItems).map((raw, i) => {
    const product = getProduct(raw?.productId);
    if (!product) { fail(`items.${i}`, 'This experience is no longer available. Please remove it.'); return null; }

    const adults = toInt(raw.adults);
    const children = toInt(raw.children);
    if (!Number.isInteger(adults) || adults < 0 || !Number.isInteger(children) || children < 0) fail(`items.${i}.guests`, 'Check the number of guests.');
    else if (adults < 1) fail(`items.${i}.guests`, 'Each booking needs at least one adult.');
    else if (adults + children > product.maxGuests) fail(`items.${i}.guests`, `This experience takes up to ${product.maxGuests} guests per booking.`);
    const guestCount = (adults || 0) + (children || 0);

    const item = {
      productId: product.id,
      name: product.name,
      attraction: product.attraction,
      adults: adults || 0,
      children: children || 0,
      unitAdult: product.adult,
      unitChild: product.child,
      lineTotal: priceItem(product, adults || 0, children || 0),
      cancellation: product.cancellation,
    };

    if (product.parts) {
      const rawParts = Array.isArray(raw.parts) ? raw.parts : [];
      item.parts = product.parts.map((partId, p) => {
        const part = getProduct(partId);
        const date = clean(rawParts[p]?.date, 10);
        const time = clean(rawParts[p]?.time, 5);
        const problem = availabilityProblem(part, date, time, now);
        if (problem) fail(`items.${i}.parts.${p}`, problem);
        return { productId: part.id, name: part.name, date, time };
      });
    } else {
      item.date = clean(raw.date, 10);
      item.time = clean(raw.time, 5);
      const problem = availabilityProblem(product, item.date, item.time, now);
      if (problem) fail(`items.${i}.when`, problem);
    }

    if (product.namedTickets) {
      const names = Array.isArray(raw.guests) ? raw.guests : [];
      item.guests = Array.from({ length: guestCount }, (_, g) => {
        const name = clean(names[g], 80);
        if (name.length < 3 || !/\s/.test(name)) fail(`items.${i}.guests.${g}`, 'Enter first and last name, as on their ID.');
        return name;
      });
    }
    return item;
  }).filter(Boolean);

  const c = body?.customer || {};
  const customer = {
    firstName: clean(c.firstName, 60),
    lastName: clean(c.lastName, 60),
    email: clean(c.email, 160).toLowerCase(),
    phone: clean(c.phone, 32),
    country: clean(c.country, 60),
  };
  if (!customer.firstName) fail('customer.firstName', 'Enter your first name.');
  if (!customer.lastName) fail('customer.lastName', 'Enter your last name.');
  if (!EMAIL_RE.test(customer.email)) fail('customer.email', 'Enter a valid email address. Your tickets are sent here.');
  if (!/^\+?[0-9 ()-]{7,}$/.test(customer.phone)) fail('customer.phone', 'Enter a mobile number, including the country code.');
  if (!customer.country) fail('customer.country', 'Choose your country.');
  if (body?.acceptTerms !== true) fail('acceptTerms', 'Please accept the booking terms to continue.');

  if (Object.keys(errors).length) return { errors };

  const total = items.reduce((sum, item) => sum + item.lineTotal, 0);
  return {
    draft: {
      currency: CURRENCY,
      total,
      items,
      customer,
      marketingOptIn: body.marketingOptIn === true,
    },
  };
}
