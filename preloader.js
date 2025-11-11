export function createPreloader() {
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', background: 'linear-gradient(180deg,#101418,#0b0e11)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
  });

  const panel = document.createElement('div');
  Object.assign(panel.style, {
    width: 'min(520px, 92vw)', padding: '24px 22px', borderRadius: '14px',
    background: 'rgba(20,24,28,0.9)', color: 'white', boxShadow: '0 12px 32px rgba(0,0,0,0.55)'
  });

  const title = document.createElement('div');
  title.textContent = 'Simulaation valmistelu';
  Object.assign(title.style, { fontSize: '18px', fontWeight: '700', marginBottom: '12px' });

  const status = document.createElement('div');
  status.textContent = 'Alustetaan…';
  Object.assign(status.style, { fontSize: '14px', opacity: '0.9', marginBottom: '10px' });

  const barWrap = document.createElement('div');
  Object.assign(barWrap.style, { height: '8px', background: 'rgba(255,255,255,0.12)', borderRadius: '6px', overflow: 'hidden' });
  const bar = document.createElement('div');
  Object.assign(bar.style, { height: '100%', width: '0%', background: '#2e7d32', transition: 'width 180ms ease' });
  barWrap.appendChild(bar);

  const btn = document.createElement('button');
  btn.textContent = 'Käynnistä simulaatio';
  Object.assign(btn.style, {
    marginTop: '16px', padding: '10px 14px', borderRadius: '8px', border: 'none',
    background: '#1976d2', color: 'white', fontWeight: 700, cursor: 'not-allowed', opacity: '0.6'
  });
  btn.disabled = true;

  panel.appendChild(title);
  panel.appendChild(status);
  panel.appendChild(barWrap);
  panel.appendChild(btn);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  let startCb = null;
  btn.addEventListener('click', () => { if (!btn.disabled && startCb) startCb(); });

  function setProgress(pct) { bar.style.width = Math.max(0, Math.min(100, pct)) + '%'; }
  function setStatus(txt) { status.textContent = txt; }
  function enableStart() { btn.disabled = false; btn.style.cursor = 'pointer'; btn.style.opacity = '1'; }
  function onStart(cb) { startCb = cb; }
  function hide() { overlay.remove(); }

  return { setProgress, setStatus, enableStart, onStart, hide };
}
