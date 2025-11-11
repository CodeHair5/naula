import * as THREE from 'three';

function drawRoundedRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, h * 0.5, w * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function createTextSprite(text, {
  fontFamily = '600 32px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
  padding = 12,
  textColor = '#ffffff',
  bgColor = 'rgba(20,20,20,0.8)',
  borderColor = 'rgba(255,255,255,0.15)',
  borderWidth = 2,
  cornerRadius = 10,
  worldHeight = 0.5, // world units for sprite height
} = {}) {
  // Measure text first
  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d');
  mctx.font = fontFamily;
  const metrics = mctx.measureText(text);
  const textWidth = Math.ceil(metrics.width);
  const textHeight = Math.ceil(parseInt(fontFamily.match(/(\d+)px/)[1] || '32', 10) * 1.25);
  const width = textWidth + padding * 2 + borderWidth * 2;
  const height = textHeight + padding * 2 + borderWidth * 2;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.font = fontFamily;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  // Background with rounded corners
  drawRoundedRect(ctx, borderWidth / 2, borderWidth / 2, width - borderWidth, height - borderWidth, cornerRadius);
  ctx.fillStyle = bgColor;
  ctx.fill();
  if (borderWidth > 0) {
    ctx.lineWidth = borderWidth;
    ctx.strokeStyle = borderColor;
    ctx.stroke();
  }

  // Text
  ctx.fillStyle = textColor;
  ctx.fillText(text, width / 2, height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 2;
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);

  // Maintain aspect ratio: worldHeight corresponds to canvas height
  const aspect = width / height;
  sprite.scale.set(worldHeight * aspect, worldHeight, 1);
  return sprite;
}
