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
    dismiss.addEventListener('click', () => {
      notice.hidden = true;
      try {
        localStorage.setItem(storageKey, '1');
      } catch {
        // Keep the notice closed on this page.
      }
    });
    notice.hidden = false;
  }
}
