// Shared behavior for the custom Help/Export overlays. Native dialog sheets
// retain their own browser-managed focus and inertness.
export function createModal({ id, closeButton, opener, beforeOpen, beforeClose, afterClose }) {
  const element = document.getElementById(id);
  const close = document.getElementById(closeButton);
  const fallback = document.getElementById(opener);
  const app = document.getElementById('app');
  let returnFocus = null, wasInert = false;

  function show(open) {
    if (open === element.classList.contains('open')) return;
    if (open) {
      returnFocus = document.activeElement;
      beforeOpen?.();
      wasInert = app.inert;
      app.inert = true;
      element.classList.add('open');
      close.focus();
    } else {
      beforeClose?.();
      element.classList.remove('open');
      app.inert = wasInert;
      (returnFocus?.isConnected ? returnFocus : fallback).focus();
      afterClose?.();
    }
  }

  function handleKey(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      show(false);
    } else if (event.key === 'Tab') {
      const stops = [...element.querySelectorAll('button,select,input,a[href],[tabindex]')]
        .filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length);
      const first = stops[0], last = stops.at(-1);
      if (first && (!element.contains(document.activeElement) ||
          (event.shiftKey ? document.activeElement === first : document.activeElement === last))) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    }
  }

  close.onclick = () => show(false);
  element.addEventListener('pointerdown', event => { if (event.target === element) show(false); });
  return { show, handleKey, get open() { return element.classList.contains('open'); } };
}
