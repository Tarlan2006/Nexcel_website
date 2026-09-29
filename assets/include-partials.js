// Shared navigation is initialized only after its markup has loaded.
(() => {
  function initHeader() {
    const menuMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const desktopMenu = window.matchMedia('(min-width: 1024px)');
    let menuAnimation = null;

    function toggleMobileMenu() {
      const toggle = document.getElementById('mobile-menu-toggle');
      setMobileMenu(toggle?.getAttribute('aria-expanded') !== 'true');
    }

    function closeMobileMenu() {
      setMobileMenu(false);
    }

    function setMobileMenu(open, immediate = false) {
      const menu = document.getElementById('mobile-menu');
      const toggle = document.getElementById('mobile-menu-toggle');
      const iconOpen = document.getElementById('mobile-menu-icon-open');
      const iconClose = document.getElementById('mobile-menu-icon-close');
      if (!menu || !toggle) return;

      open = open && !desktopMenu.matches;
      const wasOpen = toggle.getAttribute('aria-expanded') === 'true';
      if (open === wasOpen && !immediate) return;
      const hidden = menu.classList.contains('hidden');
      const style = getComputedStyle(menu);
      const from = { opacity: hidden ? 0 : style.opacity, transform: hidden ? 'translateY(-8px)' : style.transform };
      menuAnimation?.cancel();
      menuAnimation = null;
      if (!open && menu.contains(document.activeElement)) {
        if (!desktopMenu.matches) toggle.focus({ preventScroll: true });
        else document.activeElement.blur();
      }
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Закрыть меню разделов' : 'Открыть меню разделов');
      menu.setAttribute('aria-hidden', String(!open));
      menu.inert = !open;
      menu.style.pointerEvents = open ? '' : 'none';
      if (iconOpen) iconOpen.classList.toggle('hidden', open);
      if (iconClose) iconClose.classList.toggle('hidden', !open);
      if (immediate || menuMotion.matches || !menu.animate || hidden && !open) {
        menu.classList.toggle('hidden', !open);
        return;
      }
      menu.classList.remove('hidden');
      const animation = menu.animate([from, {
        opacity: open ? 1 : 0,
        transform: open ? 'translateY(0)' : 'translateY(-8px)'
      }], { duration: open ? 240 : 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' });
      menuAnimation = animation;
      animation.finished.then(() => {
        if (menuAnimation !== animation) return;
        menu.classList.toggle('hidden', !open);
        animation.cancel();
        menuAnimation = null;
      }, () => {});
    }

    menuMotion.addEventListener('change', () => {
      if (menuMotion.matches) setMobileMenu(document.getElementById('mobile-menu-toggle').getAttribute('aria-expanded') === 'true', true);
    });
    desktopMenu.addEventListener('change', () => {
      if (desktopMenu.matches) setMobileMenu(false, true);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMobileMenu(); });


    document.getElementById('mobile-menu-toggle').addEventListener('click', toggleMobileMenu);
    document.querySelectorAll('#mobile-menu a').forEach(link => link.addEventListener('click', closeMobileMenu));

    const updateCurrent = () => {
      const pathname = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
      const current = pathname === '/index' ? '/' : pathname;
      document.querySelectorAll('header nav a').forEach(link => {
        const url = new URL(link.href);
        const active = url.pathname === current && url.hash === location.hash;
        if (active) link.setAttribute('aria-current', url.hash ? 'location' : 'page');
        else link.removeAttribute('aria-current');
        link.classList.toggle('underline', active);
      });
    };
    updateCurrent();
    window.addEventListener('hashchange', updateCurrent);
  }
  async function include(id, url, initialize) {
    const container = document.getElementById(id);
    if (!container) return;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('HTTP ' + response.status);
      container.innerHTML = await response.text();
      if (initialize) initialize();
    } catch (error) {
      console.warn('Could not load ' + url + ':', error);
    }
  }
  include('site-header', '/partials/header.html', initHeader);
  include('site-footer', '/partials/footer.html');
})();
