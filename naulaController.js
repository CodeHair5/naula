import * as THREE from 'three';
import { patchBaseMaterialForPlating, createCopperOverlay, createSilverOverlay, updateOverlayUniform, updateSteelUniform } from './plating.js';
import { resolvePlating } from './chemistryRules.js';

// Copper color (slightly brighter to read from distance)
const COPPER_COLOR = 0xcd7f32;

export function setupNaulaController({ renderer, camera, controls, nail, constants, onNailMoveInside, onNailMove, enablePlating = true, onAttached, onPlatingUnlocked } = {}) {
  const { TUBE_RADIUS, TUBE_HEIGHT, LIQUID_LEVEL } = constants;

  // Prepare nail state
  nail.geometry.computeBoundingBox();
  const bbox = nail.geometry.boundingBox;
  const NAIL_TIP_OFFSET = -bbox.min.y; // tip distance below origin
  const TUBE_INNER_RADIUS = TUBE_RADIUS - 0.02;

  // Base material patch only when plating visuals are enabled (prevents hiding base when no overlay)
  const steelUniformAccessor = enablePlating ? patchBaseMaterialForPlating(nail) : null;
  nail.userData.plateLocalY = -1e9;
  updateSteelUniform(steelUniformAccessor, nail.userData.plateLocalY);

  let plateOverlay = null; // current overlay mesh (copper or silver)
  let plateType = 'none'; // 'copper' | 'silver' | 'none'

  function ensureOverlay(type) {
    if (plateType === type && plateOverlay) return;
    // remove previous overlay
    if (plateOverlay) {
      nail.remove(plateOverlay);
      plateOverlay = null;
    }
    if (type === 'copper') {
      plateOverlay = createCopperOverlay(nail.geometry);
    } else if (type === 'silver') {
      plateOverlay = createSilverOverlay(nail.geometry);
    } else {
      plateOverlay = null;
    }
    if (plateOverlay) {
      plateOverlay.renderOrder = 2;
      nail.add(plateOverlay);
      // start hidden until solution color change completes
      updateOverlayUniform(plateOverlay, nail.userData.plateLocalY, 0.0);
    }
    plateType = type;
  }

  function clearOverlay() {
    if (plateOverlay) {
      nail.remove(plateOverlay);
      plateOverlay = null;
    }
    plateType = 'none';
  }

  // Drag handling (simple model: lock to center when inside; enter only from above)
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const dragPlane = new THREE.Plane();
  const dragPoint = new THREE.Vector3();
  let dragging = false;
  nail.userData.isInTube = false;
  let lastInsidePos = new THREE.Vector3().copy(nail.position);
  let lastAnyPos = new THREE.Vector3().copy(nail.position);
  let lastTipY = nail.position.y - NAIL_TIP_OFFSET;
  let attachedTube = null; // the group of the tube this nail is attached to
  // (No time-based plating logic)

  // Simple drop physics inside tube when mouse released
  let isDropping = false;
  let velY = 0; // downward velocity (>0 means moving down)
  const GRAVITY = 9.8; // m/s^2-ish units in scene scale
  // Plating unlocks only after solution color change completes while this nail is immersed
  let platingUnlocked = false;
  let unlockEligible = false; // becomes true only if we observe progress < 1 while in water during this session
  let completed = false; // once plated, disable interactions
  nail.userData.completed = false;
  // Defer starting solution reaction until first immersion touch
  let plannedReaction = null; // { color, speed }

  // Solution color reaction target by solution + nail type
  function resolveReactionTarget(solution, nailType) {
    const sol = String(solution || '').toUpperCase();
    const type = String(nailType || 'steel').toLowerCase();
    if (sol === 'CUSO4' && type === 'steel') {
      // Kuparisulfaatti haalistuu (vaalenee sinisestä)
      return { color: 0xC8D6FF, speed: 0.15 };
    }
    if (sol === 'AGNO3' && type === 'copper') {
      // Hopeanitraatti sinertyy (Cu2+)
      return { color: 0x6AA0FF, speed: 0.18 };
    }
    if (sol === 'AGNO3' && type === 'steel') {
      // Hopeanitraatti vihertyy hieman (Fe2+)
      return { color: 0x9AD27B, speed: 0.16 };
    }
    return null;
  }

  function screenToPlanePoint(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    return raycaster.ray.intersectPlane(dragPlane, dragPoint);
  }

  function onMouseDown(e) {
    if (completed) return;
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hit = raycaster.intersectObject(nail, false);
    if (hit.length) {
      dragging = true;
      controls.enabled = false;
      // cancel any ongoing drop when user grabs the nail
      isDropping = false;
      velY = 0;
      dragPlane.setFromNormalAndCoplanarPoint(
        camera.getWorldDirection(new THREE.Vector3()),
        nail.position
      );
    }
  }

  function onMouseMove(e) {
  if (completed) return;
  if (!dragging) return;
  if (!attachedTube) return; // only draggable when attached to a tube per new UX
    if (!screenToPlanePoint(e)) return;

  let targetX = dragPoint.x;
  let targetY = dragPoint.y;
  let targetZ = dragPoint.z;

    // Prevent tip going below bottom (y=0)
    targetY = Math.max(targetY, NAIL_TIP_OFFSET);

    // Always locked to tube center in XZ while attached
    targetX = attachedTube.position.x;
    targetZ = attachedTube.position.z;
      // Immediate plating growth to max immersion depth (persistent), when active and overlay exists
      if (enablePlating && plateOverlay) {
        // Do not modify plated height here; it is frozen after unlock and set exactly at unlock moment
        // Opacity is 1 only after plating is unlocked (i.e., after full color change)
        const opacity = platingUnlocked ? 1.0 : 0.0;
        updateOverlayUniform(plateOverlay, nail.userData.plateLocalY, opacity);
        updateSteelUniform(steelUniformAccessor, nail.userData.plateLocalY, opacity);
      }

      // Ilmoita liikkeestä putken sisällä (aaltoilun potkaisu)
      const curr = new THREE.Vector3(targetX, targetY, targetZ);
      const speed = curr.distanceTo(lastInsidePos);

      // Lasketaan kärjen korkeus ja rajataan triggereitä vain veden lähellä/sisällä
      const currTipY = targetY - NAIL_TIP_OFFSET;
      const SURFACE_BAND = 0.02; // pieni kaista meniskin/toleranssin vuoksi
      const wasAboveBand = lastTipY > (LIQUID_LEVEL + SURFACE_BAND);
      const inWaterBand = currTipY <= (LIQUID_LEVEL + SURFACE_BAND);

      // 1) Ensimmäinen kosketus veden pintaan (ylittää kaistan ylhäältä -> alas)
      const justTouched = wasAboveBand && inWaterBand;
      if (onNailMoveInside && justTouched) {
        const touchSpeed = Math.max(0.02, Math.abs(currTipY - lastTipY));
        onNailMoveInside(touchSpeed);
      }
      // Start solution reaction only upon first touch if a reaction is planned
      if (justTouched && plannedReaction && attachedTube && attachedTube.userData) {
        const react = attachedTube.userData.reaction || { active: false };
        const mats = attachedTube.userData.liquidMaterials || [];
        react.active = true;
        react.progress = 0;
        react.start = (mats[0] && mats[0].color) ? mats[0].color.clone() : (attachedTube.userData.baseColor ? attachedTube.userData.baseColor.clone() : new THREE.Color(0xffffff));
        react.target = new THREE.Color(plannedReaction.color);
        react.speed = plannedReaction.speed;
        attachedTube.userData.reaction = react;
        plannedReaction = null;
      }
      // Internal ripple trigger when attached tube has water uniforms
      if (attachedTube && attachedTube.userData && attachedTube.userData.waterUniforms && (justTouched || (inWaterBand && speed > 0.0006))) {
        const uniforms = attachedTube.userData.waterUniforms;
        const localPos = nail.position.clone().sub(attachedTube.position);
        const u = (localPos.x / (TUBE_INNER_RADIUS)) * 0.5 + 0.5;
        const v = (localPos.z / (TUBE_INNER_RADIUS)) * 0.5 + 0.5;
        uniforms.uDropTime.value = (typeof window.__waterElapsed === 'number') ? window.__waterElapsed : 0;
        uniforms.uDropCenter.value.set(Math.max(0.1, Math.min(0.9, u)), Math.max(0.1, Math.min(0.9, v)));
        const strength = Math.min(0.7, 0.3 + speed * 3.0);
        uniforms.uDropStrength.value = Math.max(uniforms.uDropStrength.value, strength);
      }

      // 2) Jatkuva liike vain veden kaistalla/sisällä -> jatkuvat riplet heti liikkeestä
      if (onNailMoveInside && inWaterBand && speed > 0.0006) {
        onNailMoveInside(speed);
      }

    lastTipY = currTipY;
    lastInsidePos.copy(curr);

    // Notify generic movement ripple regardless of being inside/outside
    const currAny = new THREE.Vector3(targetX, targetY, targetZ);
    const anySpeed = currAny.distanceTo(lastAnyPos);
    if (onNailMove && anySpeed > 0.0015) {
      onNailMove(anySpeed);
    }
    lastAnyPos.copy(currAny);

    nail.position.set(targetX, targetY, targetZ);
  }

  function onMouseUp() {
    if (completed) return;
    if (!dragging) return;
    dragging = false;
    controls.enabled = true;
    if (attachedTube) {
      // if the tip is at/under surface, start dropping; otherwise stay put (still attached)
      const SURFACE_BAND = 0.02;
      const tipY = nail.position.y - NAIL_TIP_OFFSET;
      if (tipY <= (LIQUID_LEVEL + SURFACE_BAND)) {
        isDropping = true;
        velY = 0;
      } else {
        isDropping = false;
        velY = 0;
      }
    }
  }

  renderer.domElement.addEventListener('mousedown', onMouseDown);
  renderer.domElement.addEventListener('mousemove', onMouseMove);
  renderer.domElement.addEventListener('mouseup', onMouseUp);

  function dispose() {
    renderer.domElement.removeEventListener('mousedown', onMouseDown);
    renderer.domElement.removeEventListener('mousemove', onMouseMove);
    renderer.domElement.removeEventListener('mouseup', onMouseUp);
  }

  // (Removed per-frame time-based plating update)

  // Public reset: detach from tube, clear overlays, reset plating and timers, and move to start
  function reset(startPosition) {
    clearOverlay();
  nail.userData.plateLocalY = -1e9;
  updateSteelUniform(steelUniformAccessor, nail.userData.plateLocalY);
    nail.userData.isInTube = false;
    attachedTube = null;
    isDropping = false;
    velY = 0;
  platingUnlocked = false;
  unlockEligible = false;
  completed = false;
  nail.userData.completed = false;
    dragging = false;
    controls.enabled = true;
    if (startPosition) {
      nail.position.copy(startPosition);
    }
    lastInsidePos.copy(nail.position);
    lastAnyPos.copy(nail.position);
    lastTipY = nail.position.y - NAIL_TIP_OFFSET;
  }

  function attachToTube(tubeGroup) {
    attachedTube = tubeGroup;
    nail.userData.isInTube = true; // treat as attached/locked
    // place well above rim so tip is not touching liquid before user drags
    // ensure tipY = (y - NAIL_TIP_OFFSET) > TUBE_HEIGHT
    const yAboveRim = TUBE_HEIGHT + NAIL_TIP_OFFSET + 0.2;
    nail.position.set(tubeGroup.position.x, yAboveRim, tubeGroup.position.z);
    lastInsidePos.copy(nail.position);
    lastAnyPos.copy(nail.position);
    lastTipY = nail.position.y - NAIL_TIP_OFFSET;
  isDropping = false;
  velY = 0;

    // Decide plating type based on solution and nail type
    const solution = (tubeGroup.userData && tubeGroup.userData.solution) || 'unknown';
    const nailType = (nail.userData && nail.userData.nailType) || 'steel';
    let desiredPlate = resolvePlating({ solution, nailType });

    // Respect controller flag: optionally disable all plating visuals for this nail
    if (!enablePlating) desiredPlate = 'none';

    if (desiredPlate === 'none') {
      clearOverlay();
      nail.userData.plateLocalY = -1e9;
      updateSteelUniform(steelUniformAccessor, nail.userData.plateLocalY, 0.0);
    } else {
      ensureOverlay(desiredPlate);
      nail.userData.plateLocalY = -1e9;
      updateOverlayUniform(plateOverlay, nail.userData.plateLocalY, 0.0);
      updateSteelUniform(steelUniformAccessor, nail.userData.plateLocalY, 0.0);
    }

    // Prepare solution reaction but do NOT start it until first immersion touch
    if (tubeGroup.userData) {
      const rt = resolveReactionTarget(solution, nailType);
      plannedReaction = rt ? { color: rt.color, speed: rt.speed } : null;
      platingUnlocked = false; // lock plating until color change completes in this session
      unlockEligible = false;  // will set true only if we see progress < 1 while immersed
    }
    if (typeof onAttached === 'function') {
      const solution = (tubeGroup.userData && tubeGroup.userData.solution) || 'unknown';
      const nailType = (nail.userData && nail.userData.nailType) || 'steel';
      onAttached(nailType, solution);
    }
  }

  // Advance solution color reaction while immersed and handle drop physics + plating while dropping
  function tick(now, dt) {
    if (!attachedTube || !attachedTube.userData) return;
    // Keep plating visuals synced to reaction progress continuously
    if (enablePlating && plateOverlay) {
      // Opacity: show only after color change completed
      const opacity = platingUnlocked ? 1.0 : 0.0;
      updateOverlayUniform(plateOverlay, nail.userData.plateLocalY, opacity);
      updateSteelUniform(steelUniformAccessor, nail.userData.plateLocalY, opacity);
    }
    // (No gradient growth for plating)
  // Drop physics when released inside tube
    if (nail.userData.isInTube && isDropping) {
      // lock to tube center on XZ
      nail.position.x = attachedTube.position.x;
      nail.position.z = attachedTube.position.z;
      velY += GRAVITY * Math.max(0, dt);
      nail.position.y = Math.max(NAIL_TIP_OFFSET, nail.position.y - velY * Math.max(0, dt));
      // Update plating growth while dropping
      if (enablePlating && plateOverlay) {
        // Keep opacity in sync while dropping; plated height stays frozen
        const opacity = platingUnlocked ? 1.0 : 0.0;
        updateOverlayUniform(plateOverlay, nail.userData.plateLocalY, opacity);
        updateSteelUniform(steelUniformAccessor, nail.userData.plateLocalY, opacity);
      }
      // Stop at bottom (tip at y=0)
      if (Math.abs(nail.position.y - NAIL_TIP_OFFSET) < 1e-4) {
        nail.position.y = NAIL_TIP_OFFSET;
        isDropping = false;
        velY = 0;
      }
      // update last positions
      lastInsidePos.copy(nail.position);
      lastTipY = nail.position.y - NAIL_TIP_OFFSET;
    }
    // If not started yet and we are immersed, start reaction from planned values
    const SURFACE_BAND = 0.02;
    const currTipY = nail.position.y - NAIL_TIP_OFFSET;
    const inWater = currTipY <= (LIQUID_LEVEL + SURFACE_BAND);
    if (plannedReaction && inWater && attachedTube && attachedTube.userData) {
      const mats = attachedTube.userData.liquidMaterials || [];
      const r = attachedTube.userData.reaction || { active: false };
      r.active = true;
      r.progress = 0;
      r.start = (mats[0] && mats[0].color) ? mats[0].color.clone() : (attachedTube.userData.baseColor ? attachedTube.userData.baseColor.clone() : new THREE.Color(0xffffff));
      r.target = new THREE.Color(plannedReaction.color);
      r.speed = plannedReaction.speed;
      attachedTube.userData.reaction = r;
      plannedReaction = null;
    }

    const react = attachedTube.userData.reaction;
    if (!(react && react.active && react.target)) return;
    if (!inWater) return;
    const prevProgress = (react.progress || 0);
    react.progress = Math.min(1, prevProgress + Math.max(0, dt) * (react.speed || 0.1));
    // Mark eligible only if we observed pre-completion state while immersed
    if (!platingUnlocked && !unlockEligible && prevProgress < 1.0) {
      unlockEligible = true;
    }
    // Unlock plating exactly when we reach completion during this session and we were previously < 1
    if (!platingUnlocked && unlockEligible && react.progress >= 1.0) {
      platingUnlocked = true;
      // Freeze plated height at current immersion level
      const localLiquidY = nail.worldToLocal(new THREE.Vector3(0, LIQUID_LEVEL, 0)).y;
      nail.userData.plateLocalY = localLiquidY;
      updateOverlayUniform(plateOverlay, nail.userData.plateLocalY, 1.0);
      updateSteelUniform(steelUniformAccessor, nail.userData.plateLocalY, 1.0);
      // mark as completed: disable further interactions
      completed = true;
      nail.userData.completed = true;
      dragging = false;
      isDropping = false;
      velY = 0;
      if (typeof onPlatingUnlocked === 'function') {
        const solution = (attachedTube.userData && attachedTube.userData.solution) || 'unknown';
        onPlatingUnlocked(plateType, solution);
      }
    }
    const mats = attachedTube.userData.liquidMaterials || [];
    const col = react.start.clone().lerp(react.target, react.progress);
    mats.forEach(m => { if (m && m.color) m.color.copy(col); });
  }

  return { dispose, attachToTube, reset, tick };
}

// (plating helpers moved to plating.js)
