// ---------- One-time card entrance; content stays visible without JS ----------
function initCardReveal() {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (motion.matches || !('IntersectionObserver' in window) || !Element.prototype.animate) return;

  const active = new Map();
  const cards = document.querySelectorAll('[data-card-reveal]');
  const observer = new IntersectionObserver((entries) => {
    // Only neighbours entering together on the same row get a stagger.
    const rows = new Map();
    entries.filter(entry => entry.isIntersecting).forEach(({ target }) => {
      observer.unobserve(target);
      if (motion.matches || target.contains(document.activeElement) || location.hash === '#' + target.id) return;
      const row = target.parentElement;
      if (!rows.has(row)) rows.set(row, new Map());
      const top = Math.round(target.getBoundingClientRect().top);
      const index = rows.get(row).get(top) || 0;
      rows.get(row).set(top, index + 1);
      const animation = target.animate([
        { opacity: 0, transform: 'translateY(16px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ], {
        duration: 460,
        delay: Math.min(index, 2) * 70,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'backwards'
      });
      active.set(target, animation);
      animation.finished.then(() => active.delete(target), () => active.delete(target));
    });
  }, { rootMargin: '0px 0px 32px 0px', threshold: 0 });

  cards.forEach(card => {
    observer.observe(card);
    // Keyboard navigation must never land on a transparent control.
    card.addEventListener('focusin', () => {
      observer.unobserve(card);
      active.get(card)?.cancel();
    });
  });
  motion.addEventListener('change', () => {
    if (!motion.matches) return;
    observer.disconnect();
    active.forEach(animation => animation.cancel());
    active.clear();
  });
}

document.addEventListener('DOMContentLoaded', initCardReveal);
