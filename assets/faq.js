// ---------- FAQ accordion ----------
function toggleFaq(index) {
  const ans = document.getElementById('faq-ans-' + index);
  const icon = document.getElementById('faq-icon-' + index);
  if (!ans) return;

  const isHidden = ans.classList.contains('hidden');
  document.querySelectorAll('[id^="faq-ans-"]').forEach((el) => {
    el.classList.add('hidden');
    el.setAttribute('aria-hidden', 'true');
    el.inert = true;
  });
  document.querySelectorAll('[id^="faq-icon-"]').forEach((el) => el.classList.remove('rotate-180'));
  document.querySelectorAll('[aria-controls^="faq-ans-"]').forEach((el) => el.setAttribute('aria-expanded', 'false'));

  if (isHidden) {
    ans.classList.remove('hidden');
    ans.setAttribute('aria-hidden', 'false');
    ans.inert = false;
    if (icon) icon.classList.add('rotate-180');
    const btn = document.querySelector('[aria-controls="faq-ans-' + index + '"]');
    if (btn) btn.setAttribute('aria-expanded', 'true');
  }
}
