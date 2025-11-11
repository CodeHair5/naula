// Lightweight info text/toast manager
// Creates a top-center banner; supports sticky and timed messages.

export function createInfoTextManager() {
  // container
  const el = document.createElement('div');
  el.id = 'info-banner';
  Object.assign(el.style, {
    position: 'fixed',
    top: '12px',
    left: '50%',
    transform: 'translateX(-50%)',
    maxWidth: '90vw',
    padding: '10px 14px',
    borderRadius: '8px',
    background: 'rgba(20,20,20,0.85)',
    color: 'white',
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
    fontSize: '14px',
    lineHeight: '1.35',
    letterSpacing: '0.2px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
    zIndex: 1000,
    opacity: '0',
    transition: 'opacity 180ms ease',
    pointerEvents: 'none',
    textAlign: 'center',
  });
  document.body.appendChild(el);

  let hideTimer = 0;
  let sticky = false;

  function _show(textOrHtml) {
    // allow HTML (for chemistry superscripts)
    el.innerHTML = textOrHtml;
    el.style.opacity = '1';
  }

  function _hide() {
    el.style.opacity = '0';
  }

  function clear() {
    sticky = false;
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = 0; }
    _hide();
  }

  function show(textOrHtml, { duration = 3000 } = {}) {
    sticky = false;
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = 0; }
    _show(textOrHtml);
    // Keep visible 4s longer if no new text comes in
    const EXTRA_HOLD_MS = 4000;
    hideTimer = window.setTimeout(() => { _hide(); hideTimer = 0; }, Math.max(500, duration + EXTRA_HOLD_MS));
  }

  function setSticky(text) {
    sticky = true;
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = 0; }
    _show(text);
  }

  return { show, setSticky, clear };
}
