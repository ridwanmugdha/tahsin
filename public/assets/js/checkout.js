/* ==========================================================================
   Eterna · checkout
   Reads the bag, lets the visitor pick dates/times/guests and names, then asks
   the server to create the order. Payment happens with Stripe (redirect),
   SumUp (card widget on this page) or test mode, whichever the server uses.
   ========================================================================== */
(() => {
  'use strict';

  const $ = (selector, context = document) => context.querySelector(selector);
  const $$ = (selector, context = document) => Array.from(context.querySelectorAll(selector));
  const bag = window.EternaBag;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  const CUSTOMER_KEY = 'eterna.checkout.customer';
  const SUMUP_SDK = 'https://gateway.sumup.com/gateway/ecom/card/v2/sdk.js';

  const form = $('[data-checkout]');
  const grid = $('[data-checkout-grid]');
  const itemsEl = $('[data-items]');
  const namesStep = $('[data-names-step]');
  const namesEl = $('[data-names]');
  const linesEl = $('[data-lines]');
  const totalEl = $('[data-total]');
  const payButton = $('[data-pay]');
  const payLabel = $('[data-pay-label]');
  const formError = $('[data-form-error]');
  const paymentEl = $('[data-payment]');
  const paymentMsg = $('[data-payment-msg]');

  let config = null;
  let rules = null;
  let products = {};
  let attractions = {};
  let busy = false;
  let pending = null; // { id, token } of the order waiting for payment
  let sumupCard = null;

  /* ------------------------------------------------------------------------
     Helpers
     ------------------------------------------------------------------------ */
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const euro = (cents) => new Intl.NumberFormat('en-IE', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: cents % 100 ? 2 : 0,
  }).format(cents / 100);
  const formatDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
  const guestsText = (item) => [plural(item.adults, 'adult', 'adults'), item.children ? plural(item.children, 'child', 'children') : ''].filter(Boolean).join(' · ');
  const lineTotal = (item) => {
    const product = products[item.productId];
    return product ? item.adults * product.adult + item.children * product.child : 0;
  };
  let uid = 0;
  const nextId = (prefix) => `${prefix}-${++uid}`;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function icon(name, className = 'icon') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', className);
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#i-${name}`);
    svg.append(use);
    return svg;
  }

  const store = {
    get(key) { try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { return null; } },
    set(key, value) { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ } },
    remove(key) { try { sessionStorage.removeItem(key); } catch { /* storage blocked */ } },
  };

  /* Rome time, mirroring the server's booking rules (the server has the final say). */
  function romeNow() {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date()).map((p) => [p.type, p.value]));
    return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
  }
  const addDays = (iso, days) => {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const minutesOf = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  const slotTooSoon = (date, time, now) => date === now.date && minutesOf(time) - now.minutes < rules.cutoffHours * 60;

  function dateProblem(product, date) {
    if (!date) return '';
    const now = romeNow();
    if (date < now.date) return 'That date has passed.';
    if (date > addDays(now.date, rules.maxDaysAhead)) return 'That date is too far ahead to book yet.';
    const venue = attractions[product.attraction];
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (venue.closedWeekdays.includes(weekday)) return `${venue.name} is closed on ${new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })}s.`;
    if (venue.closedDates.includes(date.slice(5))) return `${venue.name} is closed on that date.`;
    if (product.slots.every((slot) => slotTooSoon(date, slot, now))) return 'No times left on that day. Please choose another date.';
    return '';
  }

  function whenProblem(product, date, time) {
    if (!date) return 'Choose a date.';
    const problem = dateProblem(product, date);
    if (problem) return problem;
    if (!time) return 'Choose a time.';
    if (slotTooSoon(date, time, romeNow())) return `That time is too soon. Book at least ${rules.cutoffHours} hours ahead.`;
    return '';
  }

  /* ------------------------------------------------------------------------
     Page states
     ------------------------------------------------------------------------ */
  function showState(title, text, action) {
    const state = $('[data-state]');
    $('[data-state-title]', state).textContent = title;
    $('[data-state-text]', state).textContent = text;
    const link = $('[data-state-action]', state);
    if (action) {
      link.hidden = false;
      link.firstChild.textContent = `${action.label} `;
      link.href = action.href;
    } else {
      link.hidden = true;
    }
    state.hidden = false;
    grid.hidden = true;
  }

  /* ------------------------------------------------------------------------
     I. Your visit: one card per bag item
     ------------------------------------------------------------------------ */
  function timeSelect(product, date, value, onChange) {
    const wrap = el('div', 'control control--text control--icon');
    wrap.append(icon('clock', 'icon control-icon'));
    const select = el('select');
    select.id = nextId('time');
    const placeholder = el('option', '', 'Time');
    placeholder.value = '';
    select.append(placeholder);
    const now = romeNow();
    product.slots.forEach((slot) => {
      const option = el('option', '', slot);
      option.value = slot;
      option.disabled = Boolean(date) && slotTooSoon(date, slot, now);
      select.append(option);
    });
    select.value = product.slots.includes(value) && !(date && slotTooSoon(date, value, now)) ? value : '';
    select.addEventListener('change', () => onChange(select.value));
    wrap.append(select, icon('chevron', 'icon control-chevron'));
    return { wrap, select };
  }

  function dateInput(value, onChange) {
    const wrap = el('div', 'control control--icon');
    wrap.append(icon('calendar', 'icon control-icon'));
    const input = el('input');
    input.type = 'date';
    input.id = nextId('date');
    const now = romeNow();
    input.min = now.date;
    input.max = addDays(now.date, rules.maxDaysAhead);
    input.value = value || '';
    input.addEventListener('change', () => onChange(input.value));
    wrap.append(input);
    return { wrap, input };
  }

  // Date + time pair with its own error line. `get`/`set` read and write the bag.
  function whenRow({ product, label, errKey, get, set }) {
    const row = el('div', 'co-when');
    if (label) row.append(label);
    const fields = el('div', 'co-when-fields');
    const err = el('p', 'field-error');
    err.dataset.err = errKey;
    err.id = nextId('err');
    err.hidden = true;

    const dateField = el('div', 'field');
    const dateLabel = el('label', 'field-label', 'Date');
    const timeField = el('div', 'field');
    const timeLabel = el('label', 'field-label', 'Time');

    const showProblem = (message) => {
      err.textContent = message;
      err.hidden = !message;
    };

    const date = dateInput(get().date, (value) => {
      set({ date: value });
      const fresh = timeSelect(product, value, get().time, (time) => { set({ time }); showProblem(''); refreshTotals(); });
      time.wrap.replaceWith(fresh.wrap);
      time = fresh;
      timeLabel.htmlFor = time.select.id;
      time.select.setAttribute('aria-describedby', err.id);
      if (!time.select.value && get().time) set({ time: '' });
      showProblem(dateProblem(product, value));
      date.input.toggleAttribute('aria-invalid', Boolean(dateProblem(product, value)));
      refreshTotals();
    });
    let time = timeSelect(product, get().date, get().time, (value) => { set({ time: value }); showProblem(''); refreshTotals(); });
    if (get().time && !time.select.value) set({ time: '' });

    dateLabel.htmlFor = date.input.id;
    timeLabel.htmlFor = time.select.id;
    date.input.setAttribute('aria-describedby', err.id);
    time.select.setAttribute('aria-describedby', err.id);
    dateField.append(dateLabel, date.wrap);
    timeField.append(timeLabel, time.wrap);
    fields.append(dateField, timeField);
    row.append(fields, err);
    if (get().date) showProblem(dateProblem(product, get().date));
    return row;
  }

  function stepper({ label, hint, value, min, max, onChange }) {
    const wrap = el('div', 'co-guest');
    const id = nextId('guests');
    const text = el('label', 'co-guest-label', label);
    text.htmlFor = id;
    text.append(el('small', '', hint));
    const control = el('div', 'stepper-control');
    const minus = el('button');
    minus.type = 'button';
    minus.setAttribute('aria-label', `Fewer ${label.toLowerCase()}`);
    minus.append(icon('minus'));
    const plus = el('button');
    plus.type = 'button';
    plus.setAttribute('aria-label', `More ${label.toLowerCase()}`);
    plus.append(icon('plus'));
    const input = el('input');
    input.type = 'number';
    input.id = id;
    input.inputMode = 'numeric';
    input.value = String(value);

    const sync = (next) => {
      const limits = { min: min(), max: max() };
      const clamped = Math.min(limits.max, Math.max(limits.min, Math.round(Number(next)) || limits.min));
      input.value = String(clamped);
      input.min = String(limits.min);
      input.max = String(limits.max);
      minus.disabled = clamped <= limits.min;
      plus.disabled = clamped >= limits.max;
      return clamped;
    };
    minus.addEventListener('click', () => onChange(sync(Number(input.value) - 1)));
    plus.addEventListener('click', () => onChange(sync(Number(input.value) + 1)));
    input.addEventListener('change', () => onChange(sync(input.value)));
    sync(value);
    control.append(minus, input, plus);
    wrap.append(text, control);
    wrap.sync = () => sync(input.value);
    return wrap;
  }

  function itemCard(item, index) {
    const product = products[item.productId];
    const venue = attractions[product.attraction];
    const card = el('article', 'co-item');
    card.dataset.key = item.key;

    const media = el('div', 'co-item-media');
    const img = new Image(96, 120);
    img.src = `${product.image}?auto=format&fit=crop&w=192&h=240&q=70`;
    img.alt = '';
    img.decoding = 'async';
    media.append(img);

    const body = el('div', 'co-item-body');
    const top = el('div', 'co-item-top');
    const heading = el('div');
    heading.append(
      el('p', 'co-item-venue', `${ROMAN[index]} · ${venue ? venue.name : 'All three sights'}`),
      el('h3', 'co-item-name', product.name)
    );
    const side = el('div', 'co-item-side');
    const price = el('p', 'co-item-price', euro(lineTotal(item)));
    const remove = el('button', 'co-remove', 'Remove');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove ${product.name}`);
    remove.addEventListener('click', () => {
      bag.remove(item.key);
      renderAll();
      const first = $('.co-item button, .co-item input', itemsEl);
      if (first) first.focus();
    });
    side.append(price, remove);
    top.append(heading, side);

    const meta = el('p', 'co-item-meta');
    const metaPart = (name, text) => {
      const span = el('span', 'co-meta-part');
      span.append(icon(name), document.createTextNode(text));
      return span;
    };
    meta.append(metaPart('clock', product.duration), metaPart('undo', product.cancellation));

    body.append(top, meta);

    // When: one date/time row, or one per part for the combo.
    const current = () => bag.items().find((i) => i.key === item.key);
    if (product.parts) {
      const parts = el('div', 'co-parts');
      product.parts.forEach((partId, p) => {
        const part = products[partId];
        const label = el('p', 'co-part-name');
        label.append(el('span', 'co-part-num', ROMAN[p]), document.createTextNode(part.name));
        parts.append(whenRow({
          product: part,
          label,
          errKey: `items.${index}.parts.${p}`,
          get: () => (current().parts || [])[p] || { date: '', time: '' },
          set: (patch) => {
            const list = (current().parts || product.parts.map(() => ({ date: '', time: '' }))).map((x) => ({ ...x }));
            while (list.length < product.parts.length) list.push({ date: '', time: '' });
            list[p] = { ...list[p], ...patch };
            bag.update(item.key, { parts: list });
          },
        }));
      });
      body.append(parts);
    } else {
      body.append(whenRow({
        product,
        errKey: `items.${index}.when`,
        get: () => ({ date: current().date || '', time: current().time || '' }),
        set: (patch) => bag.update(item.key, patch),
      }));
    }

    // Guests
    const guests = el('div', 'co-guests');
    const adults = stepper({
      label: 'Adults',
      hint: `${euro(product.adult)} each`,
      value: item.adults,
      min: () => 1,
      max: () => product.maxGuests - current().children,
      onChange: (value) => { bag.update(item.key, { adults: value }); children.sync(); guestsChanged(); },
    });
    const children = stepper({
      label: 'Children',
      hint: `${euro(product.child)} each, under 18`,
      value: item.children,
      min: () => 0,
      max: () => product.maxGuests - current().adults,
      onChange: (value) => { bag.update(item.key, { children: value }); adults.sync(); guestsChanged(); },
    });
    const guestErr = el('p', 'field-error');
    guestErr.dataset.err = `items.${index}.guests`;
    guestErr.hidden = true;
    guests.append(adults, children);
    body.append(guests, guestErr);

    function guestsChanged() {
      price.textContent = euro(lineTotal(current()));
      renderNames();
      refreshTotals();
    }

    const note = venue ? venue.note : 'Each experience has its own date. Visitor names are needed for the Colosseum and the Vatican.';
    const noteEl = el('p', 'co-item-note');
    noteEl.append(icon('info'), document.createTextNode(note));
    body.append(noteEl);

    card.append(media, body);
    return card;
  }

  function renderItems() {
    itemsEl.replaceChildren(...bag.items().map(itemCard));
  }

  /* ------------------------------------------------------------------------
     III. Visitor names (named tickets only)
     ------------------------------------------------------------------------ */
  const leadName = () => `${form.elements.firstName.value} ${form.elements.lastName.value}`.trim().replace(/\s+/g, ' ');

  function renderNames() {
    const items = bag.items();
    const groups = [];
    items.forEach((item, index) => {
      const product = products[item.productId];
      if (!product?.namedTickets) return;
      const group = el('div', 'co-names-group');
      const title = el('p', 'co-names-title');
      title.id = nextId('names');
      title.append(el('span', 'co-part-num', ROMAN[index]), document.createTextNode(product.name));
      group.setAttribute('role', 'group');
      group.setAttribute('aria-labelledby', title.id);
      group.append(title);
      const list = el('div', 'co-names-list');
      const total = item.adults + item.children;
      const names = item.guests || [];
      for (let g = 0; g < total; g += 1) {
        const field = el('div', 'field');
        const id = nextId('name');
        const isChild = g >= item.adults;
        const label = el('label', 'field-label', `${isChild ? 'Child' : 'Adult'} ${isChild ? g - item.adults + 1 : g + 1}`);
        label.htmlFor = id;
        const control = el('div', 'control control--text control--icon');
        control.append(icon('user', 'icon control-icon'));
        const input = el('input');
        input.id = id;
        input.autocomplete = 'off';
        input.placeholder = 'First and last name';
        let value = names[g] || '';
        if (!value && g === 0 && leadName()) {
          value = leadName();
          input.dataset.autofill = 'lead';
        }
        input.value = value;
        const err = el('p', 'field-error');
        err.dataset.err = `items.${index}.guests.${g}`;
        err.id = nextId('err');
        err.hidden = true;
        input.setAttribute('aria-describedby', err.id);
        input.addEventListener('input', () => {
          delete input.dataset.autofill;
          saveNames(item.key);
        });
        control.append(input);
        field.append(label, control, err);
        list.append(field);
      }
      group.append(list);
      group.dataset.key = item.key;
      groups.push(group);
    });
    namesEl.replaceChildren(...groups);
    namesStep.hidden = groups.length === 0;
    $('[data-pay-num]').textContent = groups.length ? 'IV' : 'III';
    groups.forEach((group) => saveNames(group.dataset.key));
  }

  function saveNames(key) {
    const group = $(`.co-names-group[data-key="${key}"]`, namesEl);
    if (!group) return;
    bag.update(key, { guests: $$('input', group).map((input) => input.value.trim()) });
  }

  // Keep the first visitor in sync with the lead traveller until they type something else.
  function syncLeadIntoNames() {
    $$('.co-names-group', namesEl).forEach((group) => {
      const first = $('input', group);
      if (first && (first.dataset.autofill === 'lead' || !first.value)) {
        first.value = leadName();
        first.dataset.autofill = 'lead';
        saveNames(group.dataset.key);
      }
    });
  }

  /* ------------------------------------------------------------------------
     Summary + totals
     ------------------------------------------------------------------------ */
  function refreshTotals() {
    const items = bag.items();
    let total = 0;
    linesEl.replaceChildren(...items.map((item) => {
      const product = products[item.productId];
      const amount = lineTotal(item);
      total += amount;
      const li = el('li', 'co-line');
      const main = el('div', 'co-line-main');
      main.append(el('p', 'co-line-name', product.name));
      let when = 'Date to choose';
      if (product.parts) {
        const chosen = (item.parts || []).filter((p) => p.date).length;
        when = `${chosen} of ${product.parts.length} dates chosen`;
      } else if (item.date) {
        when = `${formatDate(item.date)}${item.time ? ` · ${item.time}` : ''}`;
      }
      main.append(el('p', 'co-line-meta', `${when} · ${guestsText(item)}`));
      li.append(main, el('p', 'co-line-price', euro(amount)));
      return li;
    }));
    totalEl.textContent = euro(total);
    payLabel.textContent = `Continue to payment · ${euro(total)}`;
  }

  function renderAll() {
    if (!bag.items().length) {
      showState('Your bag is empty', 'Choose an experience to start your Roman itinerary.', { label: 'Browse tickets', href: './#tickets' });
      return;
    }
    renderItems();
    renderNames();
    refreshTotals();
  }

  /* ------------------------------------------------------------------------
     Validation + errors
     ------------------------------------------------------------------------ */
  function clearErrors() {
    $$('[data-err]').forEach((err) => { err.hidden = true; err.textContent = ''; });
    $$('[aria-invalid]', form).forEach((input) => input.removeAttribute('aria-invalid'));
    formError.hidden = true;
  }

  function showErrors(fields, message) {
    clearErrors();
    const unplaced = [];
    Object.entries(fields).forEach(([key, text]) => {
      const err = $(`[data-err="${key}"]`);
      if (!err) { unplaced.push(text); return; }
      err.textContent = text;
      err.hidden = false;
      const field = err.closest('.field, .co-when, .co-step');
      const input = err.previousElementSibling?.querySelector?.('input, select') || $('input, select', field || err.parentElement);
      if (input) input.setAttribute('aria-invalid', 'true');
    });
    formError.textContent = [message, ...unplaced].filter(Boolean).join(' ');
    formError.hidden = !formError.textContent;
    const first = $$('[data-err]').find((err) => !err.hidden);
    const target = first ? first.closest('.field, .co-when, .co-check') || first : formError;
    target.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'center' });
    const focusable = target.querySelector?.('input, select');
    if (focusable) focusable.focus({ preventScroll: true });
  }

  function clientErrors(payload) {
    const errors = {};
    payload.items.forEach((item, i) => {
      const product = products[item.productId];
      if (product.parts) {
        product.parts.forEach((partId, p) => {
          const part = item.parts?.[p] || {};
          const problem = whenProblem(products[partId], part.date, part.time);
          if (problem) errors[`items.${i}.parts.${p}`] = problem;
        });
      } else {
        const problem = whenProblem(product, item.date, item.time);
        if (problem) errors[`items.${i}.when`] = problem;
      }
      if (product.namedTickets) {
        item.guests.forEach((name, g) => {
          if (name.length < 3 || !/\s/.test(name)) errors[`items.${i}.guests.${g}`] = 'Enter first and last name, as on their ID.';
        });
      }
    });
    const c = payload.customer;
    if (!c.firstName) errors['customer.firstName'] = 'Enter your first name.';
    if (!c.lastName) errors['customer.lastName'] = 'Enter your last name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email)) errors['customer.email'] = 'Enter a valid email address. Your tickets are sent here.';
    if (!/^\+?[0-9 ()-]{7,}$/.test(c.phone)) errors['customer.phone'] = 'Enter a mobile number, including the country code.';
    if (!c.country) errors['customer.country'] = 'Choose your country.';
    if (!payload.acceptTerms) errors.acceptTerms = 'Please accept the booking terms to continue.';
    return errors;
  }

  function payload() {
    const f = form.elements;
    return {
      items: bag.items().map((item) => {
        const product = products[item.productId];
        const total = item.adults + item.children;
        return {
          productId: item.productId,
          adults: item.adults,
          children: item.children,
          ...(product.parts ? { parts: item.parts || [] } : { date: item.date || '', time: item.time || '' }),
          ...(product.namedTickets ? { guests: Array.from({ length: total }, (_, g) => (item.guests || [])[g] || '') } : {}),
        };
      }),
      customer: {
        firstName: f.firstName.value.trim(),
        lastName: f.lastName.value.trim(),
        email: f.email.value.trim(),
        phone: f.phone.value.trim(),
        country: f.country.value,
      },
      acceptTerms: f.acceptTerms.checked,
      marketingOptIn: f.marketingOptIn.checked,
    };
  }

  /* ------------------------------------------------------------------------
     Submit → create order → pay
     ------------------------------------------------------------------------ */
  function setBusy(state, label) {
    busy = state;
    payButton.disabled = state;
    payButton.classList.toggle('is-loading', state);
    if (label) payLabel.textContent = label;
    else refreshTotals();
  }

  function lockForm(locked) {
    $$('.co-step:not(.co-step--pay)', form).forEach((step) => step.toggleAttribute('inert', locked));
    $$('.co-check', form).forEach((check) => check.toggleAttribute('inert', locked));
    form.classList.toggle('is-locked', locked);
    payButton.hidden = locked;
    paymentEl.hidden = !locked;
  }

  const confirmationUrl = (order) => `confirmation.html?${new URLSearchParams({ order: order.id, token: order.token })}`;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const data = payload();
    const errors = clientErrors(data);
    if (Object.keys(errors).length) {
      showErrors(errors, 'Please check the highlighted details.');
      return;
    }
    clearErrors();
    setBusy(true, 'Preparing secure payment…');
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 422 && result.fields) {
        setBusy(false);
        showErrors(result.fields, result.error);
        return;
      }
      if (!response.ok) throw new Error(result.error || 'We couldn’t start the payment. Please try again.');

      pending = { id: result.id, token: result.token };
      const next = result.next;
      if (next.type === 'redirect') {
        setBusy(true, 'Opening secure payment…');
        window.location.assign(next.url);
        return;
      }
      setBusy(false);
      lockForm(true);
      paymentEl.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'center' });
      if (next.type === 'sumup') await openSumUp(next);
      else openDemo();
    } catch (error) {
      setBusy(false);
      formError.textContent = error.message === 'Failed to fetch' ? 'We couldn’t reach the server. Check your connection and try again.' : error.message;
      formError.hidden = false;
    }
  });

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (window.SumUpCard) { resolve(); return; }
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error('The card form couldn’t load. Check your connection and try again.'));
      document.head.append(script);
    });
  }

  async function openSumUp(next) {
    $('[data-payment-title]').textContent = 'Card details';
    $('[data-demo]').hidden = true;
    paymentMsg.textContent = 'Loading the secure card form…';
    try {
      await loadScript(SUMUP_SDK);
      sumupCard = window.SumUpCard.mount({
        id: 'sumup-card',
        checkoutId: next.checkoutId,
        email: next.email,
        amount: next.amount,
        currency: next.currency,
        locale: 'en-GB',
        onLoad: () => { paymentMsg.textContent = ''; },
        onResponse: (type) => {
          if (type === 'sent') paymentMsg.textContent = 'Processing your payment…';
          else if (type === 'auth-screen') paymentMsg.textContent = 'Please complete the check from your bank.';
          else if (type === 'invalid') paymentMsg.textContent = 'Please check your card details.';
          else if (type === 'success') { paymentMsg.textContent = 'Confirming your booking…'; window.location.assign(confirmationUrl(pending)); }
          else if (type === 'fail' || type === 'error') paymentMsg.textContent = 'The payment didn’t go through. Check your details or try another card.';
        },
      });
    } catch (error) {
      paymentMsg.textContent = error.message;
    }
  }

  function openDemo() {
    $('[data-payment-title]').textContent = 'Test payment';
    $('[data-sumup]').hidden = true;
    $('[data-demo]').hidden = false;
    paymentMsg.textContent = '';
    $('[data-demo-pay]').focus({ preventScroll: true });
  }

  $('[data-demo-pay]').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    paymentMsg.textContent = 'Confirming your booking…';
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(pending.id)}/pay-demo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: pending.token }),
      });
      if (!response.ok) throw new Error();
      window.location.assign(confirmationUrl(pending));
    } catch {
      button.disabled = false;
      paymentMsg.textContent = 'Something went wrong. Please try again.';
    }
  });

  // Go back to editing: the unpaid order is simply left to expire.
  $('[data-payment-cancel]').addEventListener('click', () => {
    if (sumupCard?.unmount) sumupCard.unmount();
    sumupCard = null;
    pending = null;
    $('[data-sumup]').replaceChildren();
    $('[data-sumup]').hidden = false;
    paymentMsg.textContent = '';
    lockForm(false);
    payButton.focus();
  });

  /* ------------------------------------------------------------------------
     Lead traveller: remember details for this tab (e.g. after a cancelled payment)
     ------------------------------------------------------------------------ */
  const CUSTOMER_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'country'];
  function restoreCustomer() {
    const saved = store.get(CUSTOMER_KEY) || {};
    CUSTOMER_FIELDS.forEach((name) => { if (saved[name]) form.elements[name].value = saved[name]; });
  }
  CUSTOMER_FIELDS.forEach((name) => {
    form.elements[name].addEventListener('input', () => {
      store.set(CUSTOMER_KEY, Object.fromEntries(CUSTOMER_FIELDS.map((n) => [n, form.elements[n].value])));
      if (name === 'firstName' || name === 'lastName') syncLeadIntoNames();
      const err = $(`[data-err="customer.${name}"]`);
      if (err && !err.hidden) { err.hidden = true; form.elements[name].removeAttribute('aria-invalid'); }
    });
  });
  form.elements.acceptTerms.addEventListener('change', () => { $('[data-err="acceptTerms"]').hidden = true; });

  /* ------------------------------------------------------------------------
     Start
     ------------------------------------------------------------------------ */
  async function start() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('cancelled')) $('[data-cancelled]').hidden = false;

    if (window.location.protocol === 'file:') {
      showState('Checkout needs the server', 'Start it with “npm start” in the project folder, then open http://localhost:3000/checkout.html.', null);
      return;
    }
    try {
      const [configRes, catalogRes] = await Promise.all([fetch('/api/config'), fetch('/api/catalog')]);
      // 404 = the site is hosted without its server (e.g. a GitHub Pages preview).
      if (configRes.status === 404) {
        showState('Online booking isn’t live here yet', 'This is a preview of the website. To book now, write to hello@eterna-example.com and we’ll arrange your visit.', { label: 'Back to home', href: './' });
        return;
      }
      if (!configRes.ok || !catalogRes.ok) throw new Error();
      config = await configRes.json();
      const catalog = await catalogRes.json();
      rules = catalog.rules;
      attractions = catalog.attractions;
      products = Object.fromEntries(catalog.products.map((p) => [p.id, p]));
    } catch {
      showState('Checkout is unavailable', 'We couldn’t reach our booking system. Please try again in a moment.', { label: 'Back to home', href: './' });
      return;
    }

    // Drop anything the catalogue no longer sells.
    bag.items().forEach((item) => { if (!products[item.productId]) bag.remove(item.key); });

    if (!config.ready) {
      showState('Online booking opens soon', 'Write to hello@eterna-example.com and we’ll book your visit for you.', { label: 'Back to home', href: './' });
      return;
    }
    if (config.testMode) $('[data-test-banner]').hidden = false;
    const note = {
      stripe: 'You’ll enter your card on Stripe’s secure payment page. Apple Pay and Google Pay are available there. We never see or store your card details.',
      sumup: 'Your card details go straight to SumUp, our payment provider. We never see or store them.',
      demo: 'Test mode: no card is needed and no money moves.',
    }[config.provider];
    if (note) $('[data-provider-note]').textContent = note;

    restoreCustomer();
    grid.hidden = false;
    renderAll();
  }

  start();
})();
