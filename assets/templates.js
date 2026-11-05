function requestTemplate(templateName) {
  const message = 'Здравствуйте! Я с сайта Nexcel. Отправьте мне, пожалуйста, бесплатный шаблон «' + templateName + '».';
  window.open('https://wa.me/77711369095?text=' + encodeURIComponent(message), '_blank', 'noopener,noreferrer');
}
