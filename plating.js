import * as THREE from 'three';

// Generic plating utilities (copper/silver) and base-material masking

const COPPER_COLOR = 0xcd7f32;

// Patch base material so the base mesh is discarded below plated height
export function patchBaseMaterialForPlating(nailMesh) {
  const mat = nailMesh.material;
  if (!(mat && mat.isMeshStandardMaterial)) return null;

  const uniformY = 'uPlateY';
  const uniformOpacity = 'uPlateOpacity';
  let steelUniformRef = { shader: null };
  const originalOnBeforeCompile = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader) => {
    if (typeof originalOnBeforeCompile === 'function') originalOnBeforeCompile(shader);

  shader.uniforms[uniformY] = { value: -1e9 };
  shader.uniforms[uniformOpacity] = { value: 0.0 };

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>\n varying vec3 vLocalPos;`
    ).replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\n vLocalPos = position;`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>\n varying vec3 vLocalPos; uniform float ${uniformY}; uniform float ${uniformOpacity};`
    ).replace(
      '#include <premultiplied_alpha_fragment>',
      `#include <premultiplied_alpha_fragment>\n if (vLocalPos.y <= ${uniformY} && ${uniformOpacity} > 0.95) { discard; }`
    );

    steelUniformRef.shader = shader;
  };

  mat.needsUpdate = true; // force recompile
  return steelUniformRef;
}

export function createCopperOverlay(sourceGeometry) {
  const geom = sourceGeometry.clone();
  const material = new THREE.MeshStandardMaterial({
    color: COPPER_COLOR,
    metalness: 0.4,
    roughness: 0.9,
    emissive: new THREE.Color(0x6a3a12),
    emissiveIntensity: 0.15,
    polygonOffset: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.FrontSide,
  });

  const uniformY = 'uPlateY';
  const uniformOpacity = 'uPlateOpacity';
  material.onBeforeCompile = (shader) => {
    shader.uniforms[uniformY] = { value: -1e9 };
    shader.uniforms[uniformOpacity] = { value: 0.0 };
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>\n varying vec3 vLocalPos;`
    ).replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\n vLocalPos = position;\n transformed += normal * 0.0025;`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>\n varying vec3 vLocalPos; uniform float ${uniformY}; uniform float ${uniformOpacity};`
    ).replace(
      '#include <premultiplied_alpha_fragment>',
      `#include <premultiplied_alpha_fragment>\n if (vLocalPos.y > ${uniformY}) { discard; }\n gl_FragColor.a *= ${uniformOpacity};`
    );

    material.userData.shader = shader;
  };

  const mesh = new THREE.Mesh(geom, material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

export function createSilverOverlay(sourceGeometry) {
  const geom = sourceGeometry.clone();
  const material = new THREE.MeshStandardMaterial({
    color: 0xdddddd,
    metalness: 1.0,
    roughness: 0.3,
    emissive: new THREE.Color(0x111111),
    emissiveIntensity: 0.05,
    polygonOffset: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.FrontSide,
  });

  const uniformY = 'uPlateY';
  const uniformOpacity = 'uPlateOpacity';
  material.onBeforeCompile = (shader) => {
    shader.uniforms[uniformY] = { value: -1e9 };
    shader.uniforms[uniformOpacity] = { value: 0.0 };
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>\n varying vec3 vLocalPos;`
    ).replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\n vLocalPos = position;\n transformed += normal * 0.0020;`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>\n varying vec3 vLocalPos; uniform float ${uniformY}; uniform float ${uniformOpacity};`
    ).replace(
      '#include <premultiplied_alpha_fragment>',
      `#include <premultiplied_alpha_fragment>\n if (vLocalPos.y > ${uniformY}) { discard; }\n gl_FragColor.a *= ${uniformOpacity};`
    );

    material.userData.shader = shader;
  };

  const mesh = new THREE.Mesh(geom, material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

export function updateOverlayUniform(overlayMesh, localY, opacity = 1.0) {
  if (!overlayMesh) return;
  const mat = overlayMesh.material;
  const shader = mat.userData && mat.userData.shader;
  if (!(shader && shader.uniforms)) return;
  if (shader.uniforms.uPlateY !== undefined) shader.uniforms.uPlateY.value = localY;
  if (shader.uniforms.uPlateOpacity !== undefined) shader.uniforms.uPlateOpacity.value = Math.max(0, Math.min(1, opacity));
}

export function updateSteelUniform(steelUniformAccessor, localY, opacity = 1.0) {
  if (!steelUniformAccessor || !steelUniformAccessor.shader) return;
  const shader = steelUniformAccessor.shader;
  if (!(shader.uniforms)) return;
  if (shader.uniforms.uPlateY !== undefined) shader.uniforms.uPlateY.value = localY;
  if (shader.uniforms.uPlateOpacity !== undefined) shader.uniforms.uPlateOpacity.value = Math.max(0, Math.min(1, opacity));
}
