(() => {
  const counterId = 114138546;
  const contactGoals = new Map([
    ['https://wa.me', 'contact_whatsapp'],
    ['https://t.me', 'contact_telegram']
  ]);
  const protocolGoals = new Map([
    ['tel:', 'contact_phone'],
    ['mailto:', 'contact_email']
  ]);
  const whatsAppActions = new Set(['whatsapp-topic', 'whatsapp-message', 'request-template', 'send-roi']);

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
    if (!(event.target instanceof Element)) return;
    const control = event.target.closest('a[href], button[data-action]');
    if (!control) return;
    const goal = control instanceof HTMLAnchorElement
      ? protocolGoals.get(control.protocol) || contactGoals.get(control.origin)
      : whatsAppActions.has(control.dataset.action) && 'contact_whatsapp';
    if (goal) window.ym(counterId, 'reachGoal', goal);
  });
})();
