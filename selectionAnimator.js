import * as THREE from 'three';

// Simple, encapsulated tweens for selection pulse and move-to-target.
// No external deps; uses requestAnimationFrame. Optional controls lock.

export function createSelectionAnimator({ controls } = {}) {
  const active = new Map(); // object -> cancel function

  function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  function animate(duration, onUpdate) {
    let raf = 0;
    const t0 = performance.now();
    const cancel = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
    function loop(now) {
      const t = Math.min(1, (now - t0) / duration);
      onUpdate(t);
      if (t < 1) raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return cancel;
  }

  function stopFor(obj) {
    const c = active.get(obj);
    if (c) { try { c(); } catch {} active.delete(obj); }
  }

  function animateSelect(obj, { lift = 0.25, duration = 220 } = {}) {
    stopFor(obj);
    const startY = obj.position.y;
    const targetY = startY + lift;
    const origScale = obj.scale.clone();
    const targetScale = origScale.clone().multiplyScalar(1.05);
    const prevControls = controls ? controls.enabled : undefined;
    if (controls) controls.enabled = false;
    const cancel = animate(duration, (tLin) => {
      const t = easeInOutQuad(tLin);
      obj.position.y = THREE.MathUtils.lerp(startY, targetY, t);
      obj.scale.lerpVectors(origScale, targetScale, t);
    });
    active.set(obj, () => {
      cancel();
      if (controls && prevControls !== undefined) controls.enabled = prevControls;
    });
    return new Promise((resolve) => setTimeout(() => {
      // settle back scale a bit
      obj.scale.copy(origScale);
      if (controls && prevControls !== undefined) controls.enabled = prevControls;
      active.delete(obj);
      resolve();
    }, duration + 10));
  }

  function animateMoveTo(obj, target, { duration = 600 } = {}) {
    stopFor(obj);
    const start = obj.position.clone();
    const end = target.clone();
    const prevControls = controls ? controls.enabled : undefined;
    if (controls) controls.enabled = false;
    const cancel = animate(duration, (tLin) => {
      const t = easeInOutQuad(tLin);
      obj.position.lerpVectors(start, end, t);
    });
    active.set(obj, () => {
      cancel();
      if (controls && prevControls !== undefined) controls.enabled = prevControls;
    });
    return new Promise((resolve) => setTimeout(() => {
      obj.position.copy(end);
      if (controls && prevControls !== undefined) controls.enabled = prevControls;
      active.delete(obj);
      resolve();
    }, duration + 10));
  }

  function cancelAll() {
    for (const [obj, c] of active.entries()) { try { c(); } catch {} }
    active.clear();
  }

  return { animateSelect, animateMoveTo, cancelAll };
}
