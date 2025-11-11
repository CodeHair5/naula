import * as THREE from 'three';

// Subtle, shader-based water surface effect (inspired by hapot/lib/water.js style)
// Usage:
//   const water = createSubtleWater({ radius, level });
//   group.add(water.mesh);
//   water.update(dt); // in animate loop
//   water.pulse(amount); // kick small ripple when nail moves inside
export function createSubtleWater({ radius, level, color = 0x3a7bd5, opacity = 0.2 }) {
  // Käytä rengasgeometriaa -> ei keskuspistettä -> ei "säteileviä" diagonaaleja keskeltä
  const inner = Math.max(0.02 * radius, 0.004);
  const geo = new THREE.RingGeometry(inner, radius, 128);
  geo.rotateX(-Math.PI / 2);

  const uniforms = {
    uTime: { value: 0 },
    uAmp: { value: 0 }, // target amplitude (externally kicked)
    uAmpState: { value: 0 }, // internal smoothed value
    uRadius: { value: radius },
    uColor: { value: new THREE.Color(color) },
    uOpacity: { value: opacity },
    uLightDir: { value: new THREE.Vector3(0.5, 1.0, 0.3).normalize() },
    uAmbient: { value: 0.35 },
  };

  const vert = `
    uniform float uTime; 
    uniform float uAmp; 
    uniform float uAmpState; 
    uniform float uRadius;
    varying float vRip;
    varying vec3 vNormalApprox;
    void main(){
      vec3 p = position;
      float r = max(1e-4, length(p.xz));
      // Two gentle traveling waves with slightly different speeds and phases
      float k1 = 10.0, c1 = 1.4;
      float k2 = 6.0,  c2 = 1.0;
      float ph1 = k1 * r - c1 * uTime;
      float ph2 = k2 * r + c2 * uTime * 0.85;
      float s1 = sin(ph1);
      float s2 = 0.6 * sin(ph2);
      float att = exp(-2.2 * r / uRadius);
      float wave = (s1 + s2) * att * uAmpState;
      p.y += wave;
      vRip = wave;
      // Analytic gradient for normal approximation
      float c1d = k1 * cos(ph1);
      float c2d = 0.6 * k2 * cos(ph2);
      float dw_dr = (c1d + c2d) * att + (s1 + s2) * (-2.2 / uRadius) * att;
      float dx = p.x / r;
      float dz = p.z / r;
      float dwdx = dw_dr * dx * uAmpState;
      float dwdz = dw_dr * dz * uAmpState;
      vec3 n = normalize(vec3(-dwdx, 1.0, -dwdz));
      vNormalApprox = n;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
    }
  `;

  const frag = `
    uniform vec3 uColor;
    uniform float uOpacity;
    uniform vec3 uLightDir;
    uniform float uAmbient;
    varying float vRip;
    varying vec3 vNormalApprox;
    void main(){
      vec3 N = normalize(vNormalApprox);
      vec3 L = normalize(uLightDir);
      float lambertWrap = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
      vec3 col = uColor * (uAmbient + lambertWrap);
      float a = clamp(uOpacity + 0.18 * abs(vRip), 0.0, 0.4);
      gl_FragColor = vec4(col, a);
    }
  `;

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthTest: true,
    depthWrite: true,           // kirjoita syvyyttä -> ei sekoitu nesteeseen
    polygonOffset: true,
    polygonOffsetFactor: -1,    // vedä hieman lähemmäs kameraa kuin nesteen yläpinta
    polygonOffsetUnits: -1,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = level + 0.001; // hienovarainen offset, estää z-fightingin nesteen yläpinnan kanssa
  mesh.renderOrder = 1; // piirrä nesteen jälkeen

  // Controller: pulse and update
  function pulse(amount) {
    // clamp and accumulate subtly
    uniforms.uAmp.value = Math.min(0.06, Math.max(uniforms.uAmp.value, amount));
  }

  function update(dt) {
    uniforms.uTime.value += dt;
    // smooth towards target amplitude
    const target = uniforms.uAmp.value;
    uniforms.uAmpState.value += (target - uniforms.uAmpState.value) * Math.min(1.0, dt * 6.0);
    // exponential decay of the target itself
    uniforms.uAmp.value *= Math.pow(0.5, dt * 2.5);
  }

  return { mesh, pulse, update };
}
