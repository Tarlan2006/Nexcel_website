(() => {
  const counterId = 114138546;
  const contactGoals = new Map([
    ['https://wa.me', 'contact_whatsapp'],
    ['https://t.me', 'contact_telegram']
  ]);

  window.ym = window.ym || function () {
    (window.ym.a = window.ym.a || []).push(arguments);
  };
  window.ym.l = Date.now();

  const tag = document.createElement('script');
  tag.async = true;
  tag.src = 'https://mc.yandex.ru/metrika/tag.js?id=' + counterId;
  document.head.appendChild(tag);

  window.ym(counterId, 'init', {
    ssr: true,
    webvisor: true,
    clickmap: true,
    referrer: document.referrer,
    url: location.href,
    accurateTrackBounce: true,
    trackLinks: true
  });

  document.addEventListener('click', event => {
    const link = event.target instanceof Element && event.target.closest('a[href]');
    if (!(link instanceof HTMLAnchorElement)) return;

    const goal = link.protocol === 'mailto:' ? 'contact_email' : contactGoals.get(link.origin);
    if (goal) window.ym(counterId, 'reachGoal', goal);
  });
})();
