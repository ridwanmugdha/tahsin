/* ==========================================================================
   Eterna admin · availability & prices calendar
   Pick an experience, select days on the month grid, then set open/closed,
   tickets available and adult/child prices for them. Only the fields you
   change are saved, so the other settings on those days stay as they were.
   ========================================================================== */
(() => {
  'use strict';

  const $ = (selector, context = document) => context.querySelector(selector);
  const $$ = (selector, context = document) => Array.from(context.querySelectorAll(selector));
  const data = JSON.parse($('#av-data').textContent);
  const products = Object.fromEntries(data.products.map((p) => [p.id, p]));
  const BLANK = { closed: false, capacity: null, adult: null, child: null, sold: 0, left: null };

  const productSelect = $('[data-av-product]');
  const monthTitle = $('[data-av-month]');
  const prevButton = $('[data-av-prev]');
  const nextButton = $('[data-av-next]');
  const grid = $('[data-av-grid]');
  const form = $('[data-ed-form]');
  const edTitle = $('[data-ed-title]');
  const edSub = $('[data-ed-sub]');
  const edStandard = $('[data-ed-standard]');
  const edSold = $('[data-ed-sold]');
  const edError = $('[data-ed-error]');
  const edMsg = $('[data-ed-msg]');
  const saveButton = $('[data-ed-save]');
  const resetButton = $('[data-ed-reset]');
  const inputs = { capacity: form.elements.capacity, adult: form.elements.adult, child: form.elements.child };
  const radios = $$('input[name="closed"]', form);

  /* ------------------------------------------------------------------------
     Helpers
     ------------------------------------------------------------------------ */
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const euro = (cents) => new Intl.NumberFormat('en-IE', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: cents % 100 ? 2 : 0,
  }).format(cents / 100);
  const euros = (cents) => (cents === null ? '' : (cents / 100).toFixed(2).replace(/\.00$/, ''));
  const utc = (iso) => new Date(`${iso}T12:00:00Z`);
  const addDays = (iso, days) => {
    const d = utc(iso);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const shiftMonth = (month, by) => {
    const d = utc(`${month}-01`);
    d.setUTCMonth(d.getUTCMonth() + by);
    return d.toISOString().slice(0, 7);
  };
  const format = (iso, options) => utc(iso).toLocaleDateString('en-GB', { timeZone: 'UTC', ...options });
  const isWeekend = (iso) => [0, 6].includes(utc(iso).getUTCDay());

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /* ------------------------------------------------------------------------
     State
     ------------------------------------------------------------------------ */
  const firstMonth = data.today.slice(0, 7);
  const lastMonth = data.lastDay.slice(0, 7);
  const params = new URLSearchParams(window.location.search);
  let productId = products[params.get('product')] ? params.get('product') : data.products[0].id;
  let month = /^\d{4}-\d{2}$/.test(params.get('month') || '') ? params.get('month') : firstMonth;
  if (month < firstMonth || month > lastMonth) month = firstMonth;

  let days = new Map(); // date -> { closed, capacity, adult, child, sold, left }
  let selected = new Set();
  let anchor = null; // last clicked day, for shift-click ranges
  const dirty = new Set(); // editor fields the admin changed
  let mixed = new Set(); // editor fields whose value differs across the selected days
  let request = 0;

  const product = () => products[productId];
  const dayOf = (date) => days.get(date) || BLANK;
  const venueClosed = (date) => product().closedWeekdays.includes(utc(date).getUTCDay()) || product().closedDates.includes(date.slice(5));
  const selectable = (date) => date.slice(0, 7) === month && date >= data.today && date <= data.lastDay && !venueClosed(date);

  // Monday-first weeks covering the month.
  function gridDates() {
    const first = `${month}-01`;
    const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
    const start = addDays(first, -((utc(first).getUTCDay() + 6) % 7));
    const end = addDays(last, (7 - utc(last).getUTCDay()) % 7);
    const dates = [];
    for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);
    return dates;
  }

  /* ------------------------------------------------------------------------
     Calendar
     ------------------------------------------------------------------------ */
  function stockText(date, day) {
    if (venueClosed(date)) return 'Venue closed';
    if (date < data.today) return day.sold ? `${day.sold} sold` : '';
    if (day.closed) return 'Closed';
    if (day.left === 0) return 'Sold out';
    if (day.left !== null) return `${day.left} of ${day.capacity} left`;
    return day.sold ? `${day.sold} sold` : 'No limit';
  }

  function renderCalendar() {
    const p = product();
    monthTitle.textContent = format(`${month}-01`, { month: 'long', year: 'numeric' });
    prevButton.disabled = month <= firstMonth;
    nextButton.disabled = month >= lastMonth;

    grid.replaceChildren(...gridDates().map((date) => {
      if (date.slice(0, 7) !== month) {
        const out = el('div', 'av-day av-day--out');
        out.setAttribute('aria-hidden', 'true');
        return out;
      }
      const day = dayOf(date);
      const open = selectable(date);
      const stock = stockText(date, day);
      const adult = day.adult ?? p.adult;
      const button = el('button', 'av-day');
      button.type = 'button';
      button.dataset.date = date;
      button.disabled = !open;
      button.classList.toggle('av-today', date === data.today);
      button.classList.toggle('is-custom', day.adult !== null || day.child !== null);
      button.classList.toggle('is-closed', open && (day.closed || day.left === 0));
      button.classList.toggle('is-low', open && !day.closed && day.left > 0 && day.left <= 5);
      button.setAttribute('aria-pressed', String(selected.has(date)));
      button.setAttribute('aria-label', [
        format(date, { weekday: 'long', day: 'numeric', month: 'long' }),
        `adult ${euro(adult)}${day.child !== null ? `, child ${euro(day.child)}` : ''}`,
        stock,
      ].filter(Boolean).join('. '));
      button.append(el('span', 'av-num', String(Number(date.slice(8)))), el('span', 'av-price', euro(adult)), el('span', 'av-stock', stock));
      return button;
    }));
  }

  function showSelection() {
    $$('.av-day[data-date]', grid).forEach((button) => button.setAttribute('aria-pressed', String(selected.has(button.dataset.date))));
    edMsg.textContent = '';
    renderEditor();
  }

  grid.addEventListener('click', (event) => {
    const button = event.target.closest('.av-day[data-date]');
    if (!button || button.disabled) return;
    const date = button.dataset.date;
    if (event.shiftKey && anchor) {
      const [from, to] = [anchor, date].sort();
      gridDates().filter((d) => d >= from && d <= to && selectable(d)).forEach((d) => selected.add(d));
    } else if (selected.has(date)) {
      selected.delete(date);
    } else {
      selected.add(date);
    }
    anchor = date;
    showSelection();
  });

  $$('[data-select]').forEach((button) => button.addEventListener('click', () => {
    const mode = button.dataset.select;
    const dates = gridDates().filter(selectable);
    selected = new Set(mode === 'none' ? [] : dates.filter((d) => mode === 'all' || (mode === 'weekends') === isWeekend(d)));
    anchor = null;
    showSelection();
  }));

  /* ------------------------------------------------------------------------
     Editor
     ------------------------------------------------------------------------ */
  function common(field) {
    const values = [...selected].map((date) => dayOf(date)[field]);
    return values.every((v) => v === values[0]) ? { value: values[0] } : { mixed: true };
  }

  function renderEditor() {
    const p = product();
    const list = [...selected].sort();
    edError.hidden = true;
    disarmReset();
    if (!list.length) {
      edTitle.textContent = 'Select days';
      edSub.textContent = 'Click days on the calendar to change them. Shift-click selects a range.';
      form.hidden = true;
      return;
    }
    form.hidden = false;
    if (list.length === 1) {
      edTitle.textContent = format(list[0], { weekday: 'long', day: 'numeric', month: 'long' });
      edSub.textContent = p.name;
    } else {
      edTitle.textContent = `${list.length} days selected`;
      edSub.textContent = `${format(list[0], { day: 'numeric', month: 'short' })} – ${format(list.at(-1), { day: 'numeric', month: 'short' })} · ${p.name}`;
    }

    // Show the selected days' current values; a field that differs between them shows "Mixed".
    mixed = new Set();
    const closed = common('closed');
    if (closed.mixed) mixed.add('closed');
    if (!dirty.has('closed')) radios.forEach((radio) => { radio.checked = !closed.mixed && (radio.value === 'closed') === closed.value; });
    const standard = { capacity: 'No limit', adult: `${euros(p.adult)} (standard)`, child: `${euros(p.child)} (standard)` };
    Object.entries(inputs).forEach(([field, input]) => {
      const current = common(field);
      if (current.mixed) mixed.add(field);
      if (dirty.has(field)) return;
      input.value = current.mixed || current.value === null ? '' : field === 'capacity' ? String(current.value) : euros(current.value);
      input.placeholder = current.mixed ? 'Mixed: leave empty to keep' : standard[field];
    });

    edStandard.textContent = `Standard prices: ${euro(p.adult)} adult, ${euro(p.child)} child. Leave a price empty to use the standard price.`;
    const sold = list.reduce((sum, date) => sum + dayOf(date).sold, 0);
    edSold.textContent = `Booked so far${list.length > 1 ? ' on these days' : ''}: ${plural(sold, 'ticket', 'tickets')} (paid, or awaiting payment for up to 1 hour).`;
  }

  form.addEventListener('input', (event) => {
    const field = event.target.name;
    if (!['closed', 'capacity', 'adult', 'child'].includes(field)) return;
    // Emptying a "Mixed" field means "keep each day's value", not "clear them all".
    if (field !== 'closed' && event.target.value === '' && !event.target.validity.badInput && mixed.has(field)) dirty.delete(field);
    else dirty.add(field);
    edMsg.textContent = '';
    edError.hidden = true;
  });

  function showError(message) {
    edError.textContent = message;
    edError.hidden = false;
    edMsg.textContent = '';
  }

  function readChanges() {
    const changes = {};
    if (dirty.has('closed')) changes.closed = radios.find((radio) => radio.checked)?.value === 'closed';
    for (const [field, input] of Object.entries(inputs)) {
      if (!dirty.has(field)) continue;
      const raw = input.value.trim();
      if (input.validity.badInput) throw new Error(field === 'capacity' ? 'Tickets available must be a number.' : `Enter the ${field} price as a number, e.g. 29 or 29.50.`);
      if (raw === '') { changes[field] = null; continue; }
      const value = Number(raw);
      if (field === 'capacity') {
        if (!Number.isInteger(value) || value < 0 || value > 100000) throw new Error('Tickets available must be a whole number, or empty for no limit.');
        changes.capacity = value;
      } else {
        if (!Number.isFinite(value) || value < 0 || value > 10000) throw new Error(`Enter a ${field} price between €0 and €10,000.`);
        changes[field] = Math.round(value * 100);
      }
    }
    return changes;
  }

  async function send(method, body, doneMessage) {
    edError.hidden = true;
    edMsg.textContent = '';
    saveButton.disabled = true;
    resetButton.disabled = true;
    try {
      const response = await fetch('/admin/api/days', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.status === 401) { window.location.reload(); return; }
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Couldn’t save. Please try again.');
      dirty.clear();
      await load();
      edMsg.textContent = doneMessage;
    } catch (error) {
      showError(error.message === 'Failed to fetch' ? 'Couldn’t reach the server. Check your connection and try again.' : error.message);
    } finally {
      saveButton.disabled = false;
      resetButton.disabled = false;
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    let changes;
    try {
      changes = readChanges();
    } catch (error) {
      showError(error.message);
      return;
    }
    if (!Object.keys(changes).length) {
      showError('Change a value first, then save.');
      return;
    }
    send('PUT', { productId, dates: [...selected], changes }, `Saved ${plural(selected.size, 'day', 'days')}.`);
  });

  // Reset asks for a second click instead of a dialog.
  let resetTimer = null;
  function disarmReset() {
    clearTimeout(resetTimer);
    resetTimer = null;
    resetButton.textContent = 'Reset to standard';
  }
  resetButton.addEventListener('click', () => {
    if (!resetTimer) {
      resetButton.textContent = 'Click again to reset';
      resetTimer = setTimeout(disarmReset, 4000);
      return;
    }
    disarmReset();
    send('DELETE', { productId, dates: [...selected] }, `${plural(selected.size, 'day', 'days')} back to standard: open, no limit, standard prices.`);
  });

  /* ------------------------------------------------------------------------
     Loading + navigation
     ------------------------------------------------------------------------ */
  function render() {
    renderCalendar();
    renderEditor();
    window.history.replaceState(null, '', `?${new URLSearchParams({ product: productId, month })}`);
  }

  async function load() {
    const id = ++request;
    const dates = gridDates();
    grid.classList.add('is-loading');
    try {
      const response = await fetch(`/admin/api/calendar?${new URLSearchParams({ product: productId, from: dates[0], to: dates.at(-1) })}`);
      if (response.status === 401) { window.location.reload(); return; }
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (id !== request) return;
      days = new Map(result.days.map((day) => [day.date, day]));
      render();
    } catch {
      if (id !== request) return;
      grid.replaceChildren(el('p', 'a-alert', 'Couldn’t load this month. Check your connection and reload the page.'));
    } finally {
      if (id === request) grid.classList.remove('is-loading');
    }
  }

  // After switching experience or month: start with a fresh selection.
  function go() {
    selected = new Set();
    anchor = null;
    dirty.clear();
    days = new Map();
    edMsg.textContent = '';
    render();
    load();
  }

  const groups = new Map();
  data.products.forEach((p) => groups.set(p.venue, [...(groups.get(p.venue) || []), p]));
  productSelect.replaceChildren(...[...groups].map(([venue, list]) => {
    const group = el('optgroup');
    group.label = venue;
    list.forEach((p) => group.append(new Option(p.name, p.id)));
    return group;
  }));
  productSelect.value = productId;

  productSelect.addEventListener('change', () => { productId = productSelect.value; go(); });
  prevButton.addEventListener('click', () => { month = shiftMonth(month, -1); go(); });
  nextButton.addEventListener('click', () => { month = shiftMonth(month, 1); go(); });

  render();
  load();
})();
