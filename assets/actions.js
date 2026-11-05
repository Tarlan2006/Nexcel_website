// Explicit handlers keep inline JavaScript out of HTML under Content Security Policy.
// Attribute values are data only; never evaluate them as JavaScript.
document.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const value = button.dataset.actionValue;
  switch (button.dataset.action) {
    case 'hero-direction':
      setHeroInspector(value);
      break;
    case 'whatsapp-topic':
      openWhatsAppWithCurrentTopic();
      break;
    case 'whatsapp-message':
      openWhatsApp(value);
      break;
    case 'request-template':
      requestTemplate(value);
      break;
    case 'send-roi':
      sendRoiToWhatsApp();
      break;
    case 'faq-toggle':
      if (/^\d+$/.test(value)) toggleFaq(Number(value));
      break;
  }
});
