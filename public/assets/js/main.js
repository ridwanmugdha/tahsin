/* ==========================================================================
   Eterna · landing page interactions (the bag is shared with checkout via bag.js)
   ========================================================================== */
(() => {
  'use strict';

  const $ = (selector, context = document) => context.querySelector(selector);
  const $$ = (selector, context = document) => Array.from(context.querySelectorAll(selector));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const scrollBehavior = () => (reducedMotion.matches ? 'auto' : 'smooth');

  const ATTRACTIONS = {
    colosseum: 'Colosseum, Forum & Palatine',
    vatican: 'Vatican Museums & Sistine Chapel',
    stpeters: 'St. Peter’s Basilica & Dome',
    combo: 'The Eternal Trio',
  };

  // Fixed-date closures from the venues' published calendars (MM-DD).
  const VATICAN_CLOSED = ['01-01', '01-06', '02-11', '03-19', '05-01', '06-29', '08-14', '08-15', '11-01', '12-08', '12-25', '12-26'];
  const COLOSSEUM_CLOSED = ['12-25', '01-01'];
  const COLOSSEUM_FREE_DAYS = ['04-25', '06-02', '11-04'];

  const state = { date: '', adults: 2, children: 0 };

  /* ------------------------------------------------------------------------
     Helpers
     ------------------------------------------------------------------------ */
  const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

  function todayISO() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 10);
  }

  function parseISO(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function formatDate(iso) {
    return parseISO(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }

  function guestsLabel() {
    const parts = [plural(state.adults, 'adult', 'adults')];
    if (state.children) parts.push(plural(state.children, 'child', 'children'));
    return parts.join(' · ');
  }

  function scrollToSection(el) {
    if (el) el.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  }

  // A short, factual heads-up for dates with known closures or crowds.
  function visitNote(key, iso) {
    const date = parseISO(iso);
    const day = date.getDate();
    const weekday = date.getDay();
    const monthDay = iso.slice(5);
    const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const isSunday = weekday === 0;
    const lastSunday = isSunday && day + 7 > daysInMonth;
    const firstSunday = isSunday && day <= 7;

    if (key === 'vatican') {
      if (VATICAN_CLOSED.includes(monthDay)) return 'Heads-up: the Vatican Museums are closed on this date.';
      if (isSunday && !lastSunday) return 'Heads-up: the Vatican Museums are closed on Sundays, except the last Sunday of the month.';
      if (lastSunday) return 'Last Sunday of the month: open 9:00–14:00 with free entry, so expect crowds.';
    }
    if (key === 'colosseum') {
      if (COLOSSEUM_CLOSED.includes(monthDay)) return 'Heads-up: the Colosseum is closed on this date.';
      if (firstSunday || COLOSSEUM_FREE_DAYS.includes(monthDay)) return 'Free-admission day: first-come, first-served and very crowded.';
    }
    if (key === 'stpeters' && weekday === 3) {
      return 'Wednesday mornings are usually disrupted by the papal General Audience.';
    }
    return '';
  }

  /* ------------------------------------------------------------------------
     Toast
     ------------------------------------------------------------------------ */
  const toastRegion = $('[data-toast-region]');
  let toastTimer;

  function dismissToast(el) {
    clearTimeout(toastTimer);
    if (!el.isConnected) return;
    if (reducedMotion.matches) { el.remove(); return; }
    el.classList.add('is-leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }

  function showToast(title, body, icon = 'check', action = null) {
    if (!toastRegion) return;
    clearTimeout(toastTimer);
    toastRegion.replaceChildren();

    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `
      <span class="toast-icon" aria-hidden="true"><svg class="icon"><use href="#i-${icon}"></use></svg></span>
      <div class="toast-text"><p class="toast-title"></p><p class="toast-body"></p></div>
      <button type="button" class="toast-close" aria-label="Dismiss notification"><svg class="icon" aria-hidden="true"><use href="#i-close"></use></svg></button>
      <span class="toast-progress" aria-hidden="true"></span>`;
    $('.toast-title', el).textContent = title;
    $('.toast-body', el).textContent = body;
    $('.toast-close', el).addEventListener('click', () => dismissToast(el));
    if (action) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'toast-action';
      button.textContent = action.label;
      button.addEventListener('click', () => { dismissToast(el); action.onClick(); });
      $('.toast-text', el).append(button);
    }
    toastRegion.append(el);
    toastTimer = setTimeout(() => dismissToast(el), 5200);
  }

  /* ------------------------------------------------------------------------
     Header: compact style once the page scrolls
     ------------------------------------------------------------------------ */
  const header = $('[data-header]');
  let headerTicking = false;
  const updateHeader = () => {
    header.classList.toggle('is-scrolled', window.scrollY > 12);
    headerTicking = false;
  };
  window.addEventListener('scroll', () => {
    if (!headerTicking) {
      headerTicking = true;
      requestAnimationFrame(updateHeader);
    }
  }, { passive: true });
  updateHeader();

  /* ------------------------------------------------------------------------
     Mobile menu: aria-expanded, Esc to close, focus trap, scroll lock
     ------------------------------------------------------------------------ */
  const menuToggle = $('[data-menu-toggle]');
  const menu = $('#mobile-menu');
  const menuLabel = $('[data-menu-label]');
  const isMenuOpen = () => menuToggle.getAttribute('aria-expanded') === 'true';

  function setMenu(open, { restoreFocus = true } = {}) {
    menuToggle.setAttribute('aria-expanded', String(open));
    menuLabel.textContent = open ? 'Close menu' : 'Open menu';
    menu.hidden = !open;
    menu.classList.toggle('is-open', open);
    document.body.classList.toggle('menu-open', open);
    if (open) {
      $('a', menu).focus();
    } else if (restoreFocus) {
      menuToggle.focus();
    }
  }

  menuToggle.addEventListener('click', () => setMenu(!isMenuOpen()));
  menu.addEventListener('click', (event) => {
    if (event.target.closest('a')) setMenu(false, { restoreFocus: false });
  });

  document.addEventListener('keydown', (event) => {
    if (!isMenuOpen()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setMenu(false);
      return;
    }
    if (event.key === 'Tab') {
      const focusables = [menuToggle, ...$$('a[href], button:not([disabled])', menu)];
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!focusables.includes(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  window.matchMedia('(min-width: 1100px)').addEventListener('change', (event) => {
    if (event.matches && isMenuOpen()) setMenu(false, { restoreFocus: false });
  });

  /* ------------------------------------------------------------------------
     Bag: header counter + slide-in drawer (contents live in EternaBag)
     ------------------------------------------------------------------------ */
  const bag = window.EternaBag;
  const bagButton = $('[data-bag]');
  const bagCount = $('[data-bag-count]');
  const drawer = $('[data-drawer]');
  const drawerPanel = $('.drawer-panel', drawer);
  const drawerList = $('[data-drawer-list]', drawer);
  const drawerFoot = $('[data-drawer-foot]', drawer);
  const drawerTotal = $('[data-drawer-total]', drawer);

  // Names come from the page itself, so the drawer works even before prices load.
  const productNames = Object.fromEntries($$('[data-product-id]').map((b) => [b.dataset.productId, b.dataset.product]));
  let catalog = null;
  fetch('/api/catalog')
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      if (!data) return;
      catalog = Object.fromEntries(data.products.map((p) => [p.id, p]));
      if (drawerOpen) renderDrawer();
    })
    .catch(() => { /* opened without the server: prices are shown at checkout */ });

  const euro = (cents) => new Intl.NumberFormat('en-IE', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: cents % 100 ? 2 : 0,
  }).format(cents / 100);

  function updateBagButton({ bump = false } = {}) {
    const count = bag.count();
    bagCount.textContent = String(count);
    bagButton.setAttribute('aria-label', `Your bag: ${plural(count, 'ticket', 'tickets')}`);
    bagButton.classList.toggle('has-items', count > 0);
    if (bump) {
      bagButton.classList.remove('is-bumped');
      void bagButton.offsetWidth; // restart the bump animation
      bagButton.classList.add('is-bumped');
    }
  }

  function renderDrawer() {
    const items = bag.items();
    drawerFoot.hidden = !items.length;
    if (!items.length) {
      drawerList.innerHTML = `
        <div class="drawer-empty">
          <span class="drawer-empty-icon" aria-hidden="true"><svg class="icon"><use href="#i-arch"></use></svg></span>
          <p class="drawer-empty-title">Your bag is empty</p>
          <p>Choose an experience to start your Roman itinerary.</p>
          <a class="btn btn-primary" href="#tickets" data-drawer-close>Browse tickets</a>
        </div>`;
      return;
    }
    let total = 0;
    let priced = Boolean(catalog);
    drawerList.replaceChildren(...items.map((item) => {
      const product = catalog?.[item.productId];
      const line = product ? item.adults * product.adult + item.children * product.child : null;
      if (line === null) priced = false;
      else total += line;

      const el = document.createElement('article');
      el.className = 'drawer-item';
      el.innerHTML = `
        <div class="drawer-thumb" aria-hidden="true"></div>
        <div class="drawer-item-main">
          <h3 class="drawer-item-name"></h3>
          <p class="drawer-item-meta"></p>
          <button class="drawer-remove" type="button">Remove</button>
        </div>
        <p class="drawer-item-price"></p>`;
      const name = product?.name || productNames[item.productId] || 'Experience';
      const guests = [plural(item.adults, 'adult', 'adults')];
      if (item.children) guests.push(plural(item.children, 'child', 'children'));
      $('.drawer-item-name', el).textContent = name;
      $('.drawer-item-meta', el).textContent = `${guests.join(' · ')} · ${item.date ? formatDate(item.date) : 'date chosen at checkout'}`;
      $('.drawer-item-price', el).textContent = line === null ? '' : euro(line);
      if (product) {
        const img = new Image(80, 100);
        img.src = `${product.image}?auto=format&fit=crop&w=160&h=200&q=70`;
        img.alt = '';
        img.decoding = 'async';
        $('.drawer-thumb', el).append(img);
      }
      const remove = $('.drawer-remove', el);
      remove.setAttribute('aria-label', `Remove ${name}`);
      remove.addEventListener('click', () => {
        bag.remove(item.key);
        drawerPanel.focus();
      });
      return el;
    }));
    drawerTotal.textContent = priced ? euro(total) : 'Shown at checkout';
  }

  let drawerOpen = false;
  let drawerReturnFocus = null;
  let drawerTimer;

  function setDrawer(open) {
    if (open === drawerOpen) return;
    drawerOpen = open;
    clearTimeout(drawerTimer);
    document.body.classList.toggle('drawer-open', open);
    if (open) {
      drawerReturnFocus = document.activeElement;
      renderDrawer();
      drawer.hidden = false;
      requestAnimationFrame(() => drawer.classList.add('is-open'));
      drawerPanel.focus();
    } else {
      drawer.classList.remove('is-open');
      drawerTimer = setTimeout(() => { drawer.hidden = true; }, reducedMotion.matches ? 0 : 320);
      if (drawerReturnFocus && document.contains(drawerReturnFocus)) drawerReturnFocus.focus({ preventScroll: true });
    }
  }

  bagButton.addEventListener('click', () => setDrawer(true));
  drawer.addEventListener('click', (event) => {
    if (event.target.closest('[data-drawer-close]')) setDrawer(false);
  });
  document.addEventListener('keydown', (event) => {
    if (!drawerOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setDrawer(false);
    } else if (event.key === 'Tab') {
      const focusables = $$('a[href], button:not([disabled])', drawerPanel);
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === drawerPanel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  bag.onChange(() => {
    updateBagButton();
    if (drawerOpen) renderDrawer();
  });
  updateBagButton();

  /* ------------------------------------------------------------------------
     Ticket chooser tabs (automatic activation, arrow-key navigation)
     ------------------------------------------------------------------------ */
  const tabs = $$('[role="tab"]');
  const panels = $$('[role="tabpanel"]');

  function activateTab(key, { focus = false } = {}) {
    if (!tabs.some((tab) => tab.dataset.tab === key)) return;
    tabs.forEach((tab) => {
      const selected = tab.dataset.tab === key;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focus) tab.focus({ preventScroll: true });
    });
    panels.forEach((panel) => {
      const selected = panel.dataset.panel === key;
      if (selected && panel.hidden) {
        panel.hidden = false;
        panel.classList.remove('is-entering');
        void panel.offsetWidth;
        panel.classList.add('is-entering');
      } else if (!selected) {
        panel.hidden = true;
      }
    });
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activateTab(tab.dataset.tab));
    tab.addEventListener('keydown', (event) => {
      const keys = {
        ArrowRight: (index + 1) % tabs.length,
        ArrowLeft: (index - 1 + tabs.length) % tabs.length,
        Home: 0,
        End: tabs.length - 1,
      };
      if (!(event.key in keys)) return;
      event.preventDefault();
      activateTab(tabs[keys[event.key]].dataset.tab, { focus: true });
    });
  });
  activateTab('colosseum');

  // Warm the other panels' images once the page has loaded, so switching tabs is instant.
  window.addEventListener('load', () => {
    $$('.tabpanel img[loading="lazy"]').forEach((img) => { img.loading = 'eager'; });
  }, { once: true });

  $$('[data-open-tab]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      activateTab(link.dataset.openTab);
      scrollToSection($('#tickets'));
    });
  });

  /* ------------------------------------------------------------------------
     "Add" buttons: put the choice in the bag, button state + toast
     ------------------------------------------------------------------------ */
  $$('[data-add]').forEach((button) => {
    const label = $('[data-add-label]', button);
    const original = label.textContent;
    let resetTimer;

    button.addEventListener('click', () => {
      const quantity = state.adults + state.children;
      const product = button.dataset.product;
      bag.add({ productId: button.dataset.productId, date: state.date, adults: state.adults, children: state.children });
      updateBagButton({ bump: true });

      button.classList.add('is-added');
      label.textContent = 'Added';
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        button.classList.remove('is-added');
        label.textContent = original;
      }, 2200);

      const when = state.date ? ` · ${formatDate(state.date)}` : '';
      showToast(
        'Added to your bag',
        `${plural(quantity, 'ticket', 'tickets')} for ${product}${when}. Your bag now holds ${plural(bag.count(), 'ticket', 'tickets')}.`,
        'bag',
        { label: 'View bag', onClick: () => setDrawer(true) }
      );
    });
  });

  /* ------------------------------------------------------------------------
     Booking widget: date min, guest steppers, validation, hand-off to tickets
     ------------------------------------------------------------------------ */
  const form = $('[data-booking]');
  const dateInput = $('#f-date');
  const dateError = $('#f-date-error');
  const summaryDate = $('[data-summary-date]');
  const summaryGuests = $('[data-summary-guests]');
  const stepperInputs = $$('.stepper-control input', form);
  const minDate = todayISO();
  dateInput.min = minDate;

  function updateSummary() {
    summaryDate.textContent = state.date ? formatDate(state.date) : 'Any date';
    summaryGuests.textContent = guestsLabel();
  }

  function syncSteppers() {
    stepperInputs.forEach((input) => {
      const min = Number(input.min);
      const max = Number(input.max);
      let value = Math.round(Number(input.value));
      if (!Number.isFinite(value)) value = min;
      value = Math.min(max, Math.max(min, value));
      input.value = String(value);
      $$(`[data-target="${input.id}"]`, form).forEach((button) => {
        const step = Number(button.dataset.step);
        button.disabled = (step < 0 && value <= min) || (step > 0 && value >= max);
      });
    });
    state.adults = Number($('#f-adults').value);
    state.children = Number($('#f-children').value);
    updateSummary();
  }

  $$('[data-step]', form).forEach((button) => {
    button.addEventListener('click', () => {
      const input = document.getElementById(button.dataset.target);
      input.value = String(Number(input.value) + Number(button.dataset.step));
      syncSteppers();
    });
  });
  stepperInputs.forEach((input) => input.addEventListener('change', syncSteppers));
  syncSteppers();

  function setDateError(message) {
    dateError.textContent = message;
    dateError.hidden = !message;
    if (message) dateInput.setAttribute('aria-invalid', 'true');
    else dateInput.removeAttribute('aria-invalid');
  }

  dateInput.addEventListener('change', () => {
    if (dateInput.value && dateInput.value >= minDate) setDateError('');
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    syncSteppers();
    const attraction = form.elements.attraction.value;
    const date = dateInput.value;

    if (!date) {
      setDateError('Please choose the date of your visit.');
      dateInput.focus();
      return;
    }
    if (date < minDate) {
      setDateError('That date has passed. Please choose today or later.');
      dateInput.focus();
      return;
    }
    setDateError('');
    state.date = date;
    updateSummary();

    const note = attraction === 'combo' ? '' : visitNote(attraction, date);
    if (attraction === 'combo') {
      scrollToSection($('#combo'));
    } else {
      activateTab(attraction);
      scrollToSection($('#tickets'));
      const activeTab = tabs.find((tab) => tab.dataset.tab === attraction);
      if (activeTab) activeTab.focus({ preventScroll: true });
    }

    const lead = attraction === 'combo'
      ? 'Your all-in-one combo is below: choose a different day for each experience.'
      : 'Here are the tickets and tours for your day.';
    showToast(
      `${ATTRACTIONS[attraction]} · ${formatDate(date)}`,
      `${guestsLabel()}. ${lead}${note ? ` ${note}` : ''}`,
      'ticket'
    );
  });

  $('[data-edit-visit]').addEventListener('click', (event) => {
    event.preventDefault();
    scrollToSection($('#book'));
    dateInput.focus({ preventScroll: true });
  });

  /* ------------------------------------------------------------------------
     FAQ accordion
     ------------------------------------------------------------------------ */
  $$('[data-accordion] .faq-q button').forEach((button) => {
    const panel = document.getElementById(button.getAttribute('aria-controls'));
    panel.hidden = button.getAttribute('aria-expanded') !== 'true';
    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!open));
      panel.hidden = open;
    });
  });

  /* ------------------------------------------------------------------------
     Newsletter (front-end validation + success state)
     ------------------------------------------------------------------------ */
  const newsletter = $('[data-newsletter]');
  const emailInput = $('#nl-email');
  const emailMessage = $('[data-nl-msg]');
  const defaultMessage = emailMessage.textContent;

  newsletter.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = emailInput.value.trim();
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
    if (!valid) {
      emailInput.setAttribute('aria-invalid', 'true');
      emailMessage.textContent = value ? 'That email address doesn’t look quite right.' : 'Please enter your email address.';
      emailMessage.classList.add('is-error');
      emailInput.focus();
      return;
    }
    emailInput.removeAttribute('aria-invalid');
    emailMessage.classList.remove('is-error');
    emailMessage.textContent = defaultMessage;
    $('[data-nl-email]', newsletter).textContent = value;
    $('[data-nl-form]', newsletter).hidden = true;
    $('[data-nl-success]', newsletter).hidden = false;
    $('[data-nl-success-title]', newsletter).focus();
  });

  emailInput.addEventListener('input', () => {
    if (emailInput.hasAttribute('aria-invalid')) {
      emailInput.removeAttribute('aria-invalid');
      emailMessage.classList.remove('is-error');
      emailMessage.textContent = defaultMessage;
    }
  });

  /* ------------------------------------------------------------------------
     Reveal on scroll
     ------------------------------------------------------------------------ */
  const revealables = $$('[data-reveal]');
  if ('IntersectionObserver' in window && !reducedMotion.matches) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.01 });
    revealables.forEach((el) => revealObserver.observe(el));
  } else {
    revealables.forEach((el) => el.classList.add('is-in'));
  }

  /* ------------------------------------------------------------------------
     Sticky mobile booking bar: visible between the hero and the final CTA
     ------------------------------------------------------------------------ */
  const bookBar = $('[data-book-bar]');
  const hero = $('.hero');
  const endZones = [$('.cta-band'), $('.site-footer')];
  if (bookBar && hero && 'IntersectionObserver' in window) {
    let heroVisible = true;
    const visibleEnds = new Set();
    const barObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.target === hero) heroVisible = entry.isIntersecting;
        else if (entry.isIntersecting) visibleEnds.add(entry.target);
        else visibleEnds.delete(entry.target);
      });
      const show = !heroVisible && visibleEnds.size === 0;
      bookBar.classList.toggle('is-visible', show);
      document.body.classList.toggle('has-book-bar', show && window.matchMedia('(max-width: 767px)').matches);
    });
    barObserver.observe(hero);
    endZones.forEach((zone) => zone && barObserver.observe(zone));
  }
})();
