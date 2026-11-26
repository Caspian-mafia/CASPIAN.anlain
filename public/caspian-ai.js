'use strict';
(() => {
  if (document.getElementById('caspianAiRoot')) return;
  const root = document.createElement('section');
  root.id = 'caspianAiRoot';
  root.className = 'caspian-ai-root';
  root.innerHTML = `
    <button class="caspian-ai-launcher" type="button" aria-label="باز کردن دستیار هوشمند CASPIAN" aria-expanded="false"><span aria-hidden="true">✦</span><b>دستیار کاسپین</b></button>
    <section class="caspian-ai-panel" hidden aria-label="دستیار هوشمند کاسپین">
      <header class="caspian-ai-head"><div><strong>✦ CASPIAN AI</strong><small>دستیار هوشمند در تمام بخش‌ها</small></div><button class="caspian-ai-close" type="button" aria-label="بستن">×</button></header>
      <div class="caspian-ai-status" role="status">در حال بررسی اتصال دستیار…</div>
      <div class="caspian-ai-messages" aria-live="polite"><p class="caspian-ai-welcome">سلام! من دستیار کاسپین هستم. درباره بازی، نقش‌ها، سناریوها یا امکانات برنامه از من بپرس.</p></div>
      <form class="caspian-ai-form"><textarea rows="2" maxlength="1600" placeholder="پیامت را بنویس…" required></textarea><button type="submit">ارسال</button></form>
      <small class="caspian-ai-foot">پاسخ‌ها کمکی‌اند؛ دستیار به اطلاعات محرمانه بازی دسترسی ندارد.</small>
    </section>`;
  document.body.append(root);
  const launcher = root.querySelector('.caspian-ai-launcher');
  const panel = root.querySelector('.caspian-ai-panel');
  const status = root.querySelector('.caspian-ai-status');
  const messages = root.querySelector('.caspian-ai-messages');
  const form = root.querySelector('form');
  const input = root.querySelector('textarea');
  const send = form.querySelector('button');
  const history = [];
  let available = false;
  const sectionForPage = () => {
    if (location.pathname.includes('admin')) return 'admin';
    if (!document.getElementById('lobby')?.classList.contains('hidden')) return 'game';
    if (document.getElementById('coinStore')) return 'home';
    return 'other';
  };
  const addMessage = (role, content) => {
    const item = document.createElement('p');
    item.className = 'caspian-ai-message ' + role;
    item.textContent = content;
    messages.append(item);
    messages.scrollTop = messages.scrollHeight;
  };
  const open = value => {
    panel.hidden = !value;
    launcher.setAttribute('aria-expanded', String(value));
    if (value) input.focus();
  };
  launcher.addEventListener('click', () => open(panel.hidden));
  root.querySelector('.caspian-ai-close').addEventListener('click', () => open(false));
  fetch('/api/ai/status', { cache: 'no-store' }).then(r => r.json()).then(data => {
    available = !!data.available;
    status.textContent = available ? 'آماده پاسخ‌گویی' : 'اتصال سرویس هوش مصنوعی هنوز در سرور تنظیم نشده است.';
    status.dataset.ready = String(available);
  }).catch(() => { status.textContent = 'وضعیت سرویس قابل دریافت نیست.'; });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message || send.disabled) return;
    const token = localStorage.getItem('caspianAuthToken') || localStorage.getItem('caspianGuestToken') || '';
    const adminKey = sessionStorage.getItem('caspianAdminKey') || '';
    if (!token && !adminKey) { addMessage('assistant', 'برای استفاده از دستیار، ابتدا پروفایل مهمان را فعال کن یا وارد حساب کاربری شو.'); return; }
    addMessage('user', message);
    history.push({ role: 'user', content: message });
    input.value = '';
    send.disabled = true;
    status.textContent = 'در حال دریافت پاسخ…';
    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(adminKey ? { 'X-Admin-Key': adminKey } : {}) },
        body: JSON.stringify({ message, history: history.slice(-8, -1), section: sectionForPage(), scenario: document.getElementById('roomScenario')?.textContent || '' })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'ارتباط با دستیار ناموفق بود.');
      addMessage('assistant', data.answer);
      history.push({ role: 'assistant', content: data.answer });
      if (history.length > 10) history.splice(0, history.length - 10);
      status.textContent = 'آماده پاسخ‌گویی';
    } catch (error) {
      addMessage('assistant', error.message || 'خطا در ارتباط با دستیار.');
      history.pop();
      status.textContent = 'اتصال نیاز به بررسی دارد.';
    } finally {
      send.disabled = false;
      input.focus();
    }
  });
})();
