// Shared navigation is initialized only after its markup has loaded.
(() => {
  function initHeader() {
    const menuMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const desktopViewport = window.matchMedia('(min-width: 1024px)');
    const desktopServices = document.getElementById('desktop-services');
    const desktopToggle = document.getElementById('desktop-services-toggle');
    const desktopList = document.getElementById('desktop-services-menu');
    const desktopLinks = [...desktopList.querySelectorAll('a')];
    const mobileMenu = document.getElementById('mobile-menu');
    const mobileToggle = document.getElementById('mobile-menu-toggle');
    const mobileServicesToggle = document.getElementById('mobile-services-toggle');
    const mobileServices = document.getElementById('mobile-services-menu');
    const iconOpen = document.getElementById('mobile-menu-icon-open');
    const iconClose = document.getElementById('mobile-menu-icon-close');
    let desktopPinned = false;
    let menuAnimation = null;

    function setDesktopServices(open, restoreFocus = false) {
      if (!open) {
        desktopPinned = false;
        if (restoreFocus && desktopList.contains(document.activeElement)) {
          desktopToggle.focus({ preventScroll: true });
        }
      }
      desktopToggle.setAttribute('aria-expanded', String(open));
      desktopList.hidden = !open;
    }

    function openDesktopServices(index) {
      desktopPinned = true;
      setDesktopServices(true);
      desktopLinks[index].focus();
    }

    desktopServices.addEventListener('pointerenter', (event) => {
      if (event.pointerType === 'mouse' && desktopViewport.matches) setDesktopServices(true);
    });
    desktopServices.addEventListener('pointerleave', () => {
      if (!desktopPinned) setDesktopServices(false, true);
    });
    desktopServices.addEventListener('focusout', (event) => {
      if (event.relatedTarget && !desktopServices.contains(event.relatedTarget)) setDesktopServices(false);
    });
    desktopToggle.addEventListener('click', () => {
      if (desktopPinned) setDesktopServices(false, true);
      else openDesktopServices(0);
    });
    desktopToggle.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      openDesktopServices(event.key === 'ArrowUp' ? desktopLinks.length - 1 : 0);
    });
    desktopList.addEventListener('keydown', (event) => {
      const current = desktopLinks.indexOf(document.activeElement);
      if (event.key === 'Tab') {
        setDesktopServices(false, true);
        return;
      }
      if (current === -1) return;
      if (event.key === ' ') {
        event.preventDefault();
        desktopLinks[current].click();
        return;
      }
      const last = desktopLinks.length - 1;
      const next = {
        ArrowDown: current === last ? 0 : current + 1,
        ArrowUp: current === 0 ? last : current - 1,
        Home: 0,
        End: last
      }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      desktopLinks[next].focus();
    });
    desktopLinks.forEach(link => link.addEventListener('click', () => setDesktopServices(false, true)));

    function setMobileServices(open, restoreFocus = false) {
      if (!open && restoreFocus) mobileServicesToggle.focus();
      mobileServicesToggle.setAttribute('aria-expanded', String(open));
      mobileServices.hidden = !open;
    }

    function setMobileMenu(open, immediate = false) {
      open = open && !desktopViewport.matches;
      const wasOpen = mobileToggle.getAttribute('aria-expanded') === 'true';
      if (open === wasOpen && !immediate) return;
      const hidden = mobileMenu.classList.contains('hidden');
      const style = getComputedStyle(mobileMenu);
      const from = { opacity: hidden ? 0 : style.opacity, transform: hidden ? 'translateY(-8px)' : style.transform };
      menuAnimation?.cancel();
      menuAnimation = null;
      if (!open) {
        if (mobileMenu.contains(document.activeElement)) {
          const fallback = desktopViewport.matches ? desktopToggle : mobileToggle;
          fallback.focus({ preventScroll: true });
        }
        setMobileServices(false);
      }
      mobileToggle.setAttribute('aria-expanded', String(open));
      mobileToggle.setAttribute('aria-label', open ? 'Закрыть меню разделов' : 'Открыть меню разделов');
      mobileMenu.setAttribute('aria-hidden', String(!open));
      mobileMenu.inert = !open;
      mobileMenu.style.pointerEvents = open ? '' : 'none';
      iconOpen.classList.toggle('hidden', open);
      iconClose.classList.toggle('hidden', !open);
      if (immediate || menuMotion.matches || !mobileMenu.animate || hidden && !open) {
        mobileMenu.classList.toggle('hidden', !open);
        return;
      }
      mobileMenu.classList.remove('hidden');
      const animation = mobileMenu.animate([from, {
        opacity: open ? 1 : 0,
        transform: open ? 'translateY(0)' : 'translateY(-8px)'
      }], { duration: open ? 240 : 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' });
      menuAnimation = animation;
      animation.finished.then(() => {
        if (menuAnimation !== animation) return;
        mobileMenu.classList.toggle('hidden', !open);
        animation.cancel();
        menuAnimation = null;
      }, () => {});
    }

    const isMobileMenuOpen = () => mobileToggle.getAttribute('aria-expanded') === 'true';
    mobileToggle.addEventListener('click', () => setMobileMenu(!isMobileMenuOpen()));
    mobileServicesToggle.addEventListener('click', () => setMobileServices(mobileServices.hidden));
    mobileMenu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMobileMenu(false)));

    menuMotion.addEventListener('change', () => {
      if (menuMotion.matches) setMobileMenu(isMobileMenuOpen(), true);
    });
    desktopViewport.addEventListener('change', () => {
      if (desktopViewport.matches) {
        setMobileMenu(false, true);
      } else {
        if (desktopServices.contains(document.activeElement)) mobileToggle.focus({ preventScroll: true });
        setDesktopServices(false);
      }
    });

    document.addEventListener('pointerdown', (event) => {
      if (!desktopList.hidden && !desktopServices.contains(event.target)) setDesktopServices(false, true);
      if (isMobileMenuOpen() && !mobileMenu.contains(event.target) && !mobileToggle.contains(event.target)) {
        setMobileMenu(false);
      }
    });
    document.addEventListener('focusin', (event) => {
      if (!desktopViewport.matches && isMobileMenuOpen() && event.target !== mobileToggle && !mobileMenu.contains(event.target)) {
        setMobileMenu(false);
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (!desktopList.hidden) setDesktopServices(false, true);
      else if (!mobileServices.hidden) setMobileServices(false, true);
      else if (isMobileMenuOpen()) setMobileMenu(false);
      else return;
      event.preventDefault();
    });

    function updateCurrent() {
      const pathname = location.pathname.replace(/\/$/, '').replace(/\.html$/, '') || '/';
      const current = pathname === '/index' ? '/' : pathname;
      for (const [nav, serviceList, trigger] of [
        [desktopServices.closest('nav'), desktopList, desktopToggle],
        [mobileMenu, mobileServices, mobileServicesToggle]
      ]) {
        let serviceCurrent = false;
        for (const link of nav.querySelectorAll('a[href^="/"]')) {
          const url = new URL(link.href);
          const active = url.pathname === current && (!url.hash || url.hash === location.hash);
          const highlighted = active || (url.pathname === '/news' && current.startsWith('/news/'));
          if (active) link.setAttribute('aria-current', url.hash ? 'location' : 'page');
          else link.removeAttribute('aria-current');
          link.classList.toggle('text-emeraldAccent', highlighted);
          link.classList.toggle('underline', highlighted);
          serviceCurrent ||= active && serviceList.contains(link);
        }
        trigger.classList.toggle('text-emeraldAccent', serviceCurrent);
        trigger.classList.toggle('underline', serviceCurrent);
      }
    }

    updateCurrent();
    window.addEventListener('hashchange', updateCurrent);
  }
  async function include(id, url, initialize) {
    const container = document.getElementById(id);
    if (!container) return;
    try {
      if (!container.firstElementChild) {
        const response = await fetch(url);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        container.innerHTML = await response.text();
      }
      if (initialize) initialize();
    } catch (error) {
      console.warn('Could not load ' + url + ':', error);
    }
  }
  include('site-header', '/partials/header.html', initHeader);
  include('site-footer', '/partials/footer.html');
})();
