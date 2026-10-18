/* ==========================================================================
   Eterna · shared bag (landing page + checkout)
   Kept in localStorage so it survives page loads; works in memory if storage
   is blocked. Prices are NOT stored here: the server prices every order.
   ========================================================================== */
window.EternaBag = (() => {
  'use strict';

  const KEY = 'eterna.bag.v1';
  const listeners = new Set();

  const read = () => {
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(value) ? value.filter((i) => i && typeof i.productId === 'string') : [];
    } catch {
      return [];
    }
  };

  let items = read();

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* private mode: keep in memory */ }
    listeners.forEach((fn) => fn(api.items()));
  }

  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  const api = {
    items: () => items.map((i) => ({ ...i, parts: i.parts ? i.parts.map((p) => ({ ...p })) : undefined, guests: i.guests ? [...i.guests] : undefined })),
    count: () => items.reduce((n, i) => n + (i.adults || 0) + (i.children || 0), 0),
    add({ productId, date = '', adults = 2, children = 0 }) {
      items.push({ key: uid(), productId, date, time: '', adults, children });
      save();
    },
    update(key, patch) {
      const item = items.find((i) => i.key === key);
      if (!item) return;
      Object.assign(item, patch);
      save();
    },
    remove(key) {
      items = items.filter((i) => i.key !== key);
      save();
    },
    clear() {
      items = [];
      save();
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };

  // Keep several open tabs in sync.
  window.addEventListener('storage', (event) => {
    if (event.key !== KEY) return;
    items = read();
    listeners.forEach((fn) => fn(api.items()));
  });

  return api;
})();
