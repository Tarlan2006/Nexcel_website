const notice = document.getElementById('cookie-notice');
const dismiss = document.getElementById('cookie-notice-dismiss');
const storageKey = 'nexcel-cookie-notice-dismissed';

if (notice && dismiss) {
  let dismissed = false;
  try {
    dismissed = localStorage.getItem(storageKey) === '1';
  } catch {
    // The notice is still usable when storage is unavailable.
  }

  if (!dismissed) {
    const page = document.documentElement;
    const reserveSpace = () => page.style.setProperty('--cookie-notice-height', notice.offsetHeight + 'px');
    const resizeObserver = 'ResizeObserver' in window ? new ResizeObserver(reserveSpace) : null;

    function keepKeyboardFocusVisible(event) {
      const control = event.target;
      if (!(control instanceof HTMLElement) || notice.contains(control) || !control.matches(':focus-visible')) return;
      const bounds = control.getBoundingClientRect();
      const overlay = notice.firstElementChild.getBoundingClientRect();
      if (bounds.bottom > overlay.top && bounds.top < overlay.bottom &&
          bounds.right > overlay.left && bounds.left < overlay.right) {
        control.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      }
    }

    dismiss.addEventListener('click', () => {
      notice.hidden = true;
      resizeObserver?.disconnect();
      page.style.removeProperty('--cookie-notice-height');
      document.removeEventListener('focusin', keepKeyboardFocusVisible);
      try {
        localStorage.setItem(storageKey, '1');
      } catch {
        // Keep the notice closed on this page.
      }
    });
    notice.hidden = false;
    reserveSpace();
    resizeObserver?.observe(notice);
    document.addEventListener('focusin', keepKeyboardFocusVisible);
  }
}
