// Shared navigation is initialized only after its markup has loaded.
(() => {
  function initHeader() {
    const events = new AbortController();
    const listen = (target, type, handler) => target.addEventListener(type, handler, { signal: events.signal });
    const menuMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const desktopViewport = window.matchMedia('(min-width: 1024px)');
    function disclosure(toggle) {
      return { toggle, list: document.getElementById(toggle.getAttribute('aria-controls')) };
    }
    const readGroups = (mode) => [...document.querySelectorAll('[data-' + mode + '-group]')].map(container => ({
      container, ...disclosure(container.querySelector('button')),
      sections: [...container.querySelectorAll('.mobile-section-toggle')].map(disclosure),
      links: [...container.querySelectorAll('a')], pinned: false
    }));
    const desktopGroups = readGroups('desktop');
    const mobileGroups = readGroups('mobile');
    const mobileMenu = document.getElementById('mobile-menu');
    const mobileToggle = document.getElementById('mobile-menu-toggle');
    const iconOpen = document.getElementById('mobile-menu-icon-open');
    const iconClose = document.getElementById('mobile-menu-icon-close');
    let menuAnimation = null;

    function setDesktopGroup(group, open, restoreFocus = false) {
      if (open) {
        desktopGroups.filter(other => other !== group).forEach(other => setDesktopGroup(other, false));
      } else {
        group.pinned = false;
        if (restoreFocus && group.list.contains(document.activeElement)) group.toggle.focus({ preventScroll: true });
      }
      group.toggle.setAttribute('aria-expanded', String(open));
      group.list.hidden = !open;
    }
    function openDesktopGroup(group, index) {
      setDesktopGroup(group, true);
      group.pinned = true;
      group.links[index].focus();
    }
    for (const group of desktopGroups) {
      listen(group.container, 'pointerenter', event => {
        if (event.pointerType === 'mouse' && desktopViewport.matches) setDesktopGroup(group, true);
      });
      listen(group.container, 'pointerleave', () => {
        if (!group.pinned) setDesktopGroup(group, false, true);
      });
      listen(group.container, 'focusout', event => {
        if (event.relatedTarget && !group.container.contains(event.relatedTarget)) setDesktopGroup(group, false);
      });
      listen(group.toggle, 'click', () => {
        if (group.pinned) setDesktopGroup(group, false, true);
        else openDesktopGroup(group, 0);
      });
      listen(group.toggle, 'keydown', event => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        openDesktopGroup(group, event.key === 'ArrowUp' ? group.links.length - 1 : 0);
      });
      listen(group.list, 'keydown', event => {
        const current = group.links.indexOf(document.activeElement);
        if (event.key === 'Tab') { setDesktopGroup(group, false, true); return; }
        if (current < 0) return;
        if (event.key === ' ') { event.preventDefault(); group.links[current].click(); return; }
        const last = group.links.length - 1;
        const next = { ArrowDown: current === last ? 0 : current + 1, ArrowUp: current === 0 ? last : current - 1, Home: 0, End: last }[event.key];
        if (next === undefined) return;
        event.preventDefault();
        group.links[next].focus();
      });
      group.links.forEach(link => listen(link, 'click', () => setDesktopGroup(group, false, true)));
    }
    function setMobileGroup(group, open, restoreFocus = false) {
      if (!open && restoreFocus) group.toggle.focus();
      if (!open) group.sections?.forEach(section => setMobileGroup(section, false));
      group.toggle.setAttribute('aria-expanded', String(open));
      group.list.hidden = !open;
    }
    function setMobileMenu(open, immediate = false) {
      open = open && !desktopViewport.matches;
      const wasOpen = mobileToggle.getAttribute('aria-expanded') === 'true';
      if (open === wasOpen && !immediate) return;
      const hidden = mobileMenu.classList.contains('hidden');
      const style = getComputedStyle(mobileMenu);
      const from = { opacity: hidden ? 0 : style.opacity, transform: hidden ? 'translateY(-8px)' : style.transform };
      menuAnimation?.cancel(); menuAnimation = null;
      if (!open) {
        if (mobileMenu.contains(document.activeElement)) {
          (desktopViewport.matches ? desktopGroups[0].toggle : mobileToggle).focus({ preventScroll: true });
        }
        mobileGroups.forEach(group => setMobileGroup(group, false));
      }
      mobileToggle.setAttribute('aria-expanded', String(open));
      mobileToggle.setAttribute('aria-label', open ? 'Закрыть меню разделов' : 'Открыть меню разделов');
      mobileMenu.setAttribute('aria-hidden', String(!open)); mobileMenu.inert = !open;
      mobileMenu.style.pointerEvents = open ? '' : 'none';
      iconOpen.classList.toggle('hidden', open); iconClose.classList.toggle('hidden', !open);
      if (immediate || menuMotion.matches || !mobileMenu.animate || hidden && !open) {
        mobileMenu.classList.toggle('hidden', !open); return;
      }
      mobileMenu.classList.remove('hidden');
      const animation = mobileMenu.animate([from, { opacity: open ? 1 : 0, transform: open ? 'translateY(0)' : 'translateY(-8px)' }],
        { duration: open ? 240 : 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' });
      menuAnimation = animation;
      animation.finished.then(() => {
        if (menuAnimation !== animation) return;
        mobileMenu.classList.toggle('hidden', !open); animation.cancel(); menuAnimation = null;
      }, () => {});
    }
    const isMobileMenuOpen = () => mobileToggle.getAttribute('aria-expanded') === 'true';
    listen(mobileToggle, 'click', () => setMobileMenu(!isMobileMenuOpen()));
    for (const group of mobileGroups) {
      for (const entry of [group, ...group.sections]) {
        listen(entry.toggle, 'click', () => setMobileGroup(entry, entry.list.hidden));
      }
    }
    mobileMenu.querySelectorAll('a').forEach(link => listen(link, 'click', () => setMobileMenu(false)));
    listen(menuMotion, 'change', () => { if (menuMotion.matches) setMobileMenu(isMobileMenuOpen(), true); });
    listen(desktopViewport, 'change', () => {
      if (desktopViewport.matches) setMobileMenu(false, true);
      else {
        if (desktopGroups.some(group => group.container.contains(document.activeElement))) mobileToggle.focus({ preventScroll: true });
        desktopGroups.forEach(group => setDesktopGroup(group, false));
      }
    });
    listen(document, 'pointerdown', event => {
      desktopGroups.forEach(group => {
        if (!group.list.hidden && !group.container.contains(event.target)) setDesktopGroup(group, false, true);
      });
      if (isMobileMenuOpen() && !mobileMenu.contains(event.target) && !mobileToggle.contains(event.target)) setMobileMenu(false);
    });
    listen(document, 'focusin', event => {
      if (!desktopViewport.matches && isMobileMenuOpen() && event.target !== mobileToggle && !mobileMenu.contains(event.target)) setMobileMenu(false);
    });
    listen(document, 'keydown', event => {
      if (event.key !== 'Escape') return;
      const desktop = desktopGroups.find(group => !group.list.hidden);
      const opened = mobileGroups.filter(group => !group.list.hidden);
      const mobile = opened.find(group => group.container.contains(document.activeElement)) || opened.at(-1);
      const section = mobile?.sections.find(entry => !entry.list.hidden &&
        (entry.toggle === document.activeElement || entry.list.contains(document.activeElement)));
      if (desktop) setDesktopGroup(desktop, false, true);
      else if (section) setMobileGroup(section, false, true);
      else if (mobile) setMobileGroup(mobile, false, true);
      else if (isMobileMenuOpen()) setMobileMenu(false);
      else return;
      event.preventDefault();
    });
    function updateCurrent() {
      const pathname = location.pathname.replace(/\/$/, '').replace(/\.html$/, '') || '/';
      const current = pathname === '/index' ? '/' : pathname;
      for (const nav of [desktopGroups[0].container.closest('nav'), mobileMenu]) {
        for (const link of nav.querySelectorAll('a[href^="/"]')) {
          const url = new URL(link.href);
          const active = url.pathname === current && (!url.hash || url.hash === location.hash);
          const highlighted = active || url.pathname === '/news' && current.startsWith('/news/');
          if (active) link.setAttribute('aria-current', url.hash ? 'location' : 'page'); else link.removeAttribute('aria-current');
          link.classList.toggle('text-emeraldAccent', highlighted); link.classList.toggle('underline', highlighted);
        }
      }
      for (const group of [...desktopGroups, ...mobileGroups]) {
        group.toggle.classList.toggle('text-emeraldAccent', group.links.some(link => link.hasAttribute('aria-current')));
      }
    }
    updateCurrent(); listen(window, 'hashchange', updateCurrent);
    return () => { events.abort(); menuAnimation?.cancel(); };
  }
  // Delegate once so refreshed footer partials retain their controls.
  document.documentElement.classList.add('footer-interactive');
  document.addEventListener('click', event => {
    const button = event.target.closest?.('#site-footer [data-footer-toggle]');
    if (button) button.setAttribute('aria-expanded', String(button.getAttribute('aria-expanded') !== 'true'));
  });
  let headerCleanup = null;
  let renderedHeader = document.querySelector('#site-header header');
  let headerMarkup = renderedHeader?.outerHTML || '';
  const requests = new Map();
  function initializeHeader() {
    if (!headerCleanup && document.querySelector('[data-desktop-group]')) headerCleanup = initHeader();
  }
  async function include(id, url, initialize, refresh = false) {
    const container = document.getElementById(id);
    if (!container) return;
    const request = (requests.get(id) || 0) + 1;
    requests.set(id, request);
    if (refresh || !container.firstElementChild) {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const markup = document.createElement('template');
        markup.innerHTML = await response.text();
        if (requests.get(id) !== request) return;
        const tag = id === 'site-header' ? 'header' : 'footer';
        const current = container.querySelector(tag), incoming = markup.content.querySelector(tag);
        if (!incoming) throw new Error('Partial response is missing its ' + tag);
        const changed = tag === 'header'
          ? current !== renderedHeader || incoming.outerHTML !== headerMarkup
          : !current || current.outerHTML !== incoming.outerHTML;
        if (changed) {
          if (tag === 'header') { headerCleanup?.(); headerCleanup = null; }
          if (current) current.replaceWith(incoming);
          else container.replaceChildren(markup.content);
          if (tag === 'header') { renderedHeader = container.querySelector('header'); headerMarkup = renderedHeader.outerHTML; }
        }
      } catch (error) { console.warn('Could not load ' + url + ':', error); }
    }
    if (!container.firstElementChild) return;
    try { if (initialize) await initialize(); }
    catch (error) { console.warn('Could not initialize ' + url + ':', error); }
  }
  initializeHeader();
  const refreshHeader = () => include('site-header', '/partials/header.html', initializeHeader, true);
  const refreshFooter = () => include('site-footer', '/partials/footer.html', () => import('/assets/cookie-notice.js'), true);
  refreshHeader(); refreshFooter();
  let reloadingPage = false;
  async function verifyDocumentVersion() {
    try {
      const current = document.querySelector('meta[name="nexcel-page-version"]')?.content;
      const response = await fetch(location.href, { cache: 'no-store' });
      if (!response.ok) return;
      const fresh = new DOMParser().parseFromString(await response.text(), 'text/html');
      const latest = fresh.querySelector('meta[name="nexcel-page-version"]')?.content;
      if (latest && latest !== current && !reloadingPage) { reloadingPage = true; location.reload(); }
    } catch (error) { console.warn('Could not verify the current page version:', error); }
  }
  if (!document.querySelector('meta[name="nexcel-page-version"]')) verifyDocumentVersion();
  window.addEventListener('pageshow', event => {
    if (event.persisted) { refreshHeader(); refreshFooter(); verifyDocumentVersion(); }
  });
})();
