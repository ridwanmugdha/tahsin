/* ==========================================================================
   Product catalogue — the ONLY place prices are decided.
   The server recalculates every total from this file; prices sent by the
   browser are ignored. All amounts are in euro cents (2900 = €29.00).

   Before launch:
   - Child prices below are placeholders. Set your real child rates.
   - Time slots are examples. Match them to the availability your suppliers give you.
   ========================================================================== */

export const CURRENCY = 'eur';

const IMG = {
  colosseum: 'https://images.unsplash.com/photo-1636804907108-fa8d2e0f7a90',
  vatican: 'https://images.unsplash.com/photo-1507671135563-4ef600e03179',
  stpeters: 'https://images.unsplash.com/photo-1575540668264-4485aacd78c3',
};

export const ATTRACTIONS = {
  colosseum: {
    name: 'Colosseum, Forum & Palatine',
    // Closed 25 December and 1 January (MM-DD).
    closedDates: ['12-25', '01-01'],
    closedWeekdays: [],
    note: 'Bring a photo ID matching the names on the tickets.',
  },
  vatican: {
    name: 'Vatican Museums & Sistine Chapel',
    // Closed on Sundays (the free last Sunday cannot be pre-booked) and on these holy days.
    closedDates: ['01-01', '01-06', '02-11', '03-19', '05-01', '06-29', '08-14', '08-15', '11-01', '12-08', '12-25', '12-26'],
    closedWeekdays: [0],
    note: 'Shoulders and knees must be covered. No photos in the Sistine Chapel.',
  },
  stpeters: {
    name: 'St. Peter’s Basilica & Dome',
    closedDates: [],
    closedWeekdays: [],
    note: 'Entry to the Basilica is free; you are booking the guide, audio guide or dome climb. Wednesday mornings are often disrupted by the General Audience.',
  },
};

export const PRODUCTS = [
  // ---- Colosseum -----------------------------------------------------------
  {
    id: 'colosseum-entry',
    attraction: 'colosseum',
    name: 'Colosseum, Forum & Palatine Priority Entry',
    duration: 'Self-paced, allow 3–4 hours',
    cancellation: 'Free cancellation up to 24h before',
    adult: 2900,
    child: 1500, // PLACEHOLDER child rate (under 18)
    maxGuests: 15,
    namedTickets: true,
    slots: ['08:30', '09:30', '10:30', '11:30', '12:30', '13:30', '14:30', '15:30'],
    image: IMG.colosseum,
  },
  {
    id: 'colosseum-arena',
    attraction: 'colosseum',
    name: 'Arena Floor & Ancient Rome Small-Group Tour',
    duration: '3 hours',
    cancellation: 'Free cancellation up to 24h before',
    adult: 6900,
    child: 4900, // PLACEHOLDER
    maxGuests: 20,
    namedTickets: true,
    slots: ['09:00', '11:00', '13:30'],
    image: IMG.colosseum,
  },
  {
    id: 'colosseum-underground',
    attraction: 'colosseum',
    name: 'Underground & Arena Premium Tour',
    duration: '3 hours',
    cancellation: 'Free cancellation up to 72h before',
    adult: 14900,
    child: 11900, // PLACEHOLDER
    maxGuests: 6,
    namedTickets: true,
    slots: ['09:15', '13:15'],
    image: IMG.colosseum,
  },

  // ---- Vatican Museums ------------------------------------------------------
  {
    id: 'vatican-entry',
    attraction: 'vatican',
    name: 'Vatican Museums & Sistine Chapel Skip-the-Line Entry',
    duration: 'Self-paced, allow about 3 hours',
    cancellation: 'Free cancellation up to 24h before',
    adult: 3500,
    child: 2500, // PLACEHOLDER
    maxGuests: 15,
    namedTickets: true,
    slots: ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'],
    image: IMG.vatican,
  },
  {
    id: 'vatican-guided',
    attraction: 'vatican',
    name: 'Vatican Museums, Sistine Chapel & St. Peter’s Guided Tour',
    duration: '3 hours',
    cancellation: 'Free cancellation up to 24h before',
    adult: 6500,
    child: 4900, // PLACEHOLDER
    maxGuests: 20,
    namedTickets: true,
    slots: ['08:30', '10:30', '13:00'],
    image: IMG.vatican,
  },
  {
    id: 'vatican-early',
    attraction: 'vatican',
    name: 'Early-Entry Vatican & Sistine Chapel Small-Group Tour',
    duration: '3 hours, early-morning start',
    cancellation: 'Free cancellation up to 72h before',
    adult: 9900,
    child: 7900, // PLACEHOLDER
    maxGuests: 12,
    namedTickets: true,
    slots: ['07:30'],
    image: IMG.vatican,
  },

  // ---- St. Peter's Basilica -------------------------------------------------
  {
    id: 'stpeters-entry',
    attraction: 'stpeters',
    name: 'St. Peter’s Basilica Reserved Entry + Audio Guide',
    duration: 'Self-paced, allow 1–1.5 hours',
    cancellation: 'Free cancellation up to 24h before',
    adult: 1300,
    child: 900, // PLACEHOLDER
    maxGuests: 15,
    namedTickets: false,
    slots: ['09:00', '10:30', '12:00', '14:00', '15:30'],
    image: IMG.stpeters,
  },
  {
    id: 'stpeters-grottoes',
    attraction: 'stpeters',
    name: 'St. Peter’s Basilica & Papal Grottoes Guided Tour',
    duration: '1.5 hours',
    cancellation: 'Free cancellation up to 24h before',
    adult: 3500,
    child: 2500, // PLACEHOLDER
    maxGuests: 20,
    namedTickets: false,
    slots: ['09:00', '11:00', '14:30'],
    image: IMG.stpeters,
  },
  {
    id: 'stpeters-dome',
    attraction: 'stpeters',
    name: 'Dome Climb & Basilica Small-Group Tour',
    duration: '2.5 hours',
    cancellation: 'Free cancellation up to 24h before',
    adult: 5900,
    child: 4500, // PLACEHOLDER
    maxGuests: 12,
    namedTickets: false,
    slots: ['08:30', '10:00', '13:30'],
    image: IMG.stpeters,
  },

  // ---- Combo ----------------------------------------------------------------
  {
    id: 'eternal-trio',
    attraction: 'combo',
    name: 'The Eternal Trio',
    duration: 'Three experiences, on the days you choose',
    cancellation: 'Free cancellation up to 24h before each experience',
    adult: 13900,
    child: 10500, // PLACEHOLDER
    compareAt: 16300,
    maxGuests: 12,
    namedTickets: true,
    // Each part gets its own date and time, using that product's slots and closures.
    parts: ['colosseum-arena', 'vatican-entry', 'stpeters-dome'],
    image: IMG.colosseum,
  },
];

export const BOOKING_RULES = {
  timeZone: 'Europe/Rome',
  // A time slot must start at least this many hours from now (Rome time).
  cutoffHours: 3,
  // How far ahead people can book.
  maxDaysAhead: 365,
  maxItems: 12,
};

const byId = new Map(PRODUCTS.map((p) => [p.id, p]));
export const getProduct = (id) => byId.get(id);

/** Public view of the catalogue, sent to the browser for display only. */
export function publicCatalog() {
  return {
    currency: CURRENCY,
    rules: BOOKING_RULES,
    attractions: ATTRACTIONS,
    products: PRODUCTS.map(({ id, attraction, name, duration, cancellation, adult, child, compareAt, maxGuests, namedTickets, slots, parts, image }) => ({
      id, attraction, name, duration, cancellation, adult, child, compareAt, maxGuests, namedTickets, slots, parts, image,
    })),
  };
}
