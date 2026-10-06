const form = document.getElementById('login');
const err = document.getElementById('err');
form.addEventListener('submit', async e => {
  e.preventDefault();
  err.hidden = true;
  const btn = form.querySelector('button');
  btn.disabled = true;
  try {
    const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Studio': '1' }, body: JSON.stringify({ token: form.token.value }) });
    if (r.ok) { location.href = '/'; return; }
    const j = await r.json().catch(() => ({}));
    err.textContent = j.error || 'Sign-in failed.';
    err.hidden = false;
  } catch {
    err.textContent = 'Network error.';
    err.hidden = false;
  } finally { btn.disabled = false; }
});
