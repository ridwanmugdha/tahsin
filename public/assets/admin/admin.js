/* ==========================================================================
   Eterna admin · sidebar menu on small screens
   ========================================================================== */
(() => {
  'use strict';

  const side = document.querySelector('[data-side]');
  const scrim = document.querySelector('.a-scrim');
  const openButton = document.querySelector('[data-side-open]');
  if (!side || !openButton) return;

  function setOpen(open) {
    side.classList.toggle('is-open', open);
    scrim.classList.toggle('is-open', open);
    openButton.setAttribute('aria-expanded', String(open));
    if (open) side.querySelector('a, button').focus();
    else openButton.focus();
  }

  openButton.addEventListener('click', () => setOpen(true));
  document.querySelectorAll('[data-side-close]').forEach((el) => el.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && side.classList.contains('is-open')) setOpen(false);
  });
})();
