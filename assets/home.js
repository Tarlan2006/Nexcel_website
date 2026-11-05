// Icons are pre-rendered as inline <svg> at build time (see scripts/inline-icons.js) —
// no icon-library JS runtime is loaded or needed here.

// ---------- Hero interactive inspector ----------
const heroContent = {
  tables: { filename: 'Nexcel_Engine_v4.gs', tag: 'LIVE SIMULATOR', topic: 'анализ данных и учет в Google Таблицах' },
  bots: { filename: 'telegram_bot.py', tag: 'BOT ONLINE', topic: 'разработку Telegram-бота с ИИ' },
  ai: { filename: 'ocr_scanner.py', tag: 'AI VISION', topic: 'внедрение ИИ и распознавание документов' },
  saas: { filename: 'licensing_portal.ts', tag: 'B2B PORTAL', topic: 'лицензии ПО и подписки на ИИ' }
};

let currentDirection = 'tables';
let heroInitialized = false;
let heroAnimation = null;
const heroMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
function stopHeroAnimation() {
  heroAnimation?.cancel();
  heroAnimation = null;
}
heroMotion.addEventListener('change', () => {
  if (heroMotion.matches) stopHeroAnimation();
});
document.getElementById('hero-panels').addEventListener('focusin', stopHeroAnimation);

function setHeroInspector(key) {
  if (!heroContent[key]) return;
  const changed = !heroInitialized || key !== currentDirection;
  if (changed) stopHeroAnimation();
  currentDirection = key;
  heroInitialized = true;

  Object.keys(heroContent).forEach((k) => {
    const pill = document.getElementById('pill-' + k);
    const panel = document.getElementById('inspector-' + k);
    if (!pill || !panel) return;
    pill.setAttribute('aria-pressed', String(k === key));
    pill.setAttribute('aria-controls', panel.id);
    panel.setAttribute('aria-hidden', String(k !== key));
    panel.inert = k !== key;

    if (k === key) {
      pill.classList.add('bg-darkBg', 'text-white', 'border-darkBg', 'font-medium');
      pill.classList.remove('bg-white', 'hover:bg-slate-50', 'text-textMain', 'border-gridBorder');
      panel.classList.remove('hidden');
    } else {
      pill.classList.remove('bg-darkBg', 'text-white', 'border-darkBg', 'font-medium');
      pill.classList.add('bg-white', 'hover:bg-slate-50', 'text-textMain', 'border-gridBorder');
      panel.classList.add('hidden');
    }
  });

  const data = heroContent[key];
  const filenameEl = document.getElementById('hero-window-filename');
  const tagEl = document.getElementById('hero-window-tag');
  if (filenameEl) filenameEl.textContent = data.filename;
  if (tagEl) tagEl.textContent = data.tag;
  const panel = document.getElementById('inspector-' + key);
  if (changed && !heroMotion.matches && panel.animate && !panel.contains(document.activeElement)) {
    heroAnimation = panel.animate([
      { opacity: 0, transform: 'translateY(8px)' },
      { opacity: 1, transform: 'translateY(0)' }
    ], { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
  }
}

// ---------- Hero mini revenue calculator ----------
function formatTenge(value) {
  return Math.round(value).toLocaleString('ru-RU') + ' ₸';
}

function updateHeroCalc() {
  const ordersEl = document.getElementById('hero-orders');
  const checkEl = document.getElementById('hero-check');
  const revEl = document.getElementById('hero-total-rev');
  const timeEl = document.getElementById('hero-time-saved');
  if (!ordersEl || !checkEl || !revEl) return;

  const orders = parseFloat(ordersEl.value) || 0;
  const check = parseFloat(checkEl.value) || 0;
  const total = orders * check;

  revEl.textContent = formatTenge(total);

  if (timeEl) {
    const hours = Math.max(4, Math.round(orders * 0.135));
    timeEl.textContent = '~' + hours + ' часов в месяц';
  }
}

// ---------- WhatsApp helper ----------
function openWhatsApp(message) {
  window.open('https://wa.me/77711369095?text=' + encodeURIComponent(message), '_blank', 'noopener,noreferrer');
}

function openWhatsAppWithCurrentTopic() {
  const topic = heroContent[currentDirection] ? heroContent[currentDirection].topic : 'оцифровку и автоматизацию бизнеса';
  openWhatsApp('Здравствуйте! Я с вашего сайта nexcel.kz, хочу обсудить проект — ' + topic + '.');
}

function requestTemplate(templateName) {
  openWhatsApp('Здравствуйте! Я с вашего сайта. Отправьте мне, пожалуйста, бесплатный шаблон «' + templateName + '».');
}

// ---------- ROI calculator ----------
const WORK_HOURS_PER_SHIFT = 8;
const AVERAGE_WEEKS_PER_MONTH = 4.33;
const WORK_HOURS_PER_MONTH = 168; // 8ч × 21 рабочий день — норма для приведения месячной ставки к часовой
const roiMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let roiFrame = 0;
let roiDisplayed = null;
let roiTarget = null;
let roiLastFrame = null;
let roiTargetChangedAt = 0;

function renderRoi(result) {
  document.getElementById('calc-res-hours').textContent = Math.round(result.hours) + ' ч';
  document.getElementById('calc-res-money').textContent = formatTenge(result.money);
  document.getElementById('calc-res-shifts').textContent = 'Около ' + Math.round(result.hours / WORK_HOURS_PER_SHIFT) + ' полных рабочих смен';
}

function finishRoiAnimation() {
  cancelAnimationFrame(roiFrame);
  roiFrame = 0;
  roiLastFrame = null;
  if (!roiTarget) return;
  roiDisplayed = { ...roiTarget };
  renderRoi(roiDisplayed);
  // Announce the final calculation, not every animation frame.
  document.getElementById('calc-announcement').textContent = 'Экономия в месяц: ' + Math.round(roiTarget.hours) + ' ч и ' + formatTenge(roiTarget.money) + '.';
}

roiMotion.addEventListener('change', () => {
  if (roiMotion.matches) finishRoiAnimation();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) finishRoiAnimation();
});

function animateRoi(now) {
  const elapsed = roiLastFrame === null ? 0 : Math.max(0, now - roiLastFrame);
  roiLastFrame = now;
  // A continuous follower: new input changes the destination, not the frame loop.
  // Time-based smoothing behaves the same on 60 Hz and 120 Hz displays.
  const blend = 1 - Math.exp(-elapsed / 85);
  roiDisplayed.hours += (roiTarget.hours - roiDisplayed.hours) * blend;
  roiDisplayed.money += (roiTarget.money - roiDisplayed.money) * blend;
  renderRoi(roiDisplayed);
  const settled = Math.abs(roiTarget.hours - roiDisplayed.hours) < 0.01 &&
    Math.abs(roiTarget.money - roiDisplayed.money) < 0.5;
  if (settled || now - roiTargetChangedAt >= 1000) finishRoiAnimation();
  else roiFrame = requestAnimationFrame(animateRoi);
}

function updateRoiCalc() {
  const employeesEl = document.getElementById('calc-employees');
  const hoursEl = document.getElementById('calc-hours');
  const rateEl = document.getElementById('calc-rate');
  if (!employeesEl || !hoursEl || !rateEl) return;

  const employees = parseFloat(employeesEl.value) || 0;
  const hours = parseFloat(hoursEl.value) || 0;
  const monthlyRate = parseFloat(rateEl.value) || 0;
  const hourlyRate = monthlyRate / WORK_HOURS_PER_MONTH;

  document.getElementById('calc-employees-val').textContent = employees + ' чел';
  document.getElementById('calc-hours-val').textContent = hours + ' часов';
  document.getElementById('calc-rate-val').textContent = monthlyRate.toLocaleString('ru-RU') + ' ₸ / мес';

  const monthlyHours = employees * hours * AVERAGE_WEEKS_PER_MONTH;
  const monthlyMoney = monthlyHours * hourlyRate;

  roiTarget = { hours: monthlyHours, money: monthlyMoney };
  roiTargetChangedAt = performance.now();
  if (!roiDisplayed || roiMotion.matches || document.hidden) {
    finishRoiAnimation();
    return;
  }
  if (!roiFrame) {
    roiLastFrame = null;
    roiFrame = requestAnimationFrame(animateRoi);
  }
}

function sendRoiToWhatsApp() {
  // A click during count-up must send the final values, not an intermediate frame.
  finishRoiAnimation();
  const hoursText = Math.round(roiTarget.hours) + ' ч';
  const moneyText = formatTenge(roiTarget.money);

  openWhatsApp('Здравствуйте! Посчитал(а) на вашем сайте экономию от автоматизации — примерно ' + hoursText + ' и ' + moneyText + ' в месяц. Хочу обсудить, как это внедрить у нас.');
}

// ---------- Case results: one-time count-up, stable accessible final text ----------
function initCaseCounters() {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (motion.matches || !('IntersectionObserver' in window)) return;
  const active = new Map();
  const finish = (target) => {
    const state = active.get(target);
    if (!state) return;
    cancelAnimationFrame(state.frame);
    state.animation?.cancel();
    if (state.value) state.value.textContent = state.finalText;
    active.delete(target);
  };
  const observer = new IntersectionObserver(entries => {
    entries.filter(entry => entry.isIntersecting).forEach(({ target }) => {
      observer.unobserve(target);
      if (motion.matches || document.hidden) return;
      const value = target.querySelector('.case-counter-value');
      if (!value) {
        if (!target.animate) return;
        const animation = target.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 600, easing: 'ease-out' });
        active.set(target, { animation });
        animation.finished.then(() => finish(target), () => active.delete(target));
        return;
      }
      const finalText = value.textContent;
      const total = Number(target.dataset.countTo);
      const state = { value, finalText, frame: 0 };
      active.set(target, state);
      let started = null;
      const tick = now => {
        if (started === null) started = now;
        const progress = Math.min(1, (now - started) / 900);
        const number = Math.round(total * (1 - Math.pow(1 - progress, 3)));
        value.textContent = finalText.replace(/[\d\s\u00a0]+/, number.toLocaleString('ru-RU'));
        if (progress < 1) state.frame = requestAnimationFrame(tick);
        else finish(target);
      };
      state.frame = requestAnimationFrame(tick);
    });
  }, { threshold: 0.5 });
  document.querySelectorAll('[data-count-to], [data-case-zero]').forEach(el => observer.observe(el));
  motion.addEventListener('change', () => {
    if (!motion.matches) return;
    observer.disconnect();
    [...active.keys()].forEach(finish);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) [...active.keys()].forEach(finish);
  });
}

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', () => {
  initCaseCounters();
  setHeroInspector('tables');
  updateHeroCalc();
  updateRoiCalc();

  const heroOrders = document.getElementById('hero-orders');
  const heroCheck = document.getElementById('hero-check');
  if (heroOrders) heroOrders.addEventListener('input', updateHeroCalc);
  if (heroCheck) heroCheck.addEventListener('input', updateHeroCalc);

  ['calc-employees', 'calc-hours', 'calc-rate'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateRoiCalc);
  });
});
