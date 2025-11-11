import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

// Luo yksinkertainen rautanaula (kärki alaspäin). Exportataan funktio uudelleenkäyttöä varten.
export function createNaula() {
  // Materiaali: himmeä metalli
  // Kiiltävä teräs ennen kuparoitumista
  const material = new THREE.MeshStandardMaterial({
    color: 0x9aa4af,
    metalness: 1.0,
    roughness: 0.15
  });

  // Mitat
  const headRadius = 0.3;
  const headHeight = 0.12;
  const shaftRadius = 0.1;
  const shaftLength = 3.0;
  const tipLength = 0.4;

  // Geometriat: pää, varsi, kärki
  const head = new THREE.CylinderGeometry(headRadius, headRadius, headHeight, 24);

  // Varsi ilman päätykansia -> ei päällekkäisiä pintoja liitoskohdissa
  const shaft = new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLength, 24, 1, true)
    .translate(0, -(headHeight / 2 + shaftLength / 2), 0);

  // Kärki ilman pohjakantta, perusta täsmälleen varren alapinnan kohdalle
  const tip = new THREE.ConeGeometry(shaftRadius, tipLength, 24, 1, true)
    .rotateX(Math.PI)
    .translate(0, -(headHeight / 2 + shaftLength + tipLength / 2), 0);

  // Yhdistä geometriat ja hitsaa verteksit, jotta liitos on saumaton
  const merged = BufferGeometryUtils.mergeGeometries([head, shaft, tip], true);
  const welded = BufferGeometryUtils.mergeVertices(merged, 1e-6);
  welded.computeVertexNormals();
  const mesh = new THREE.Mesh(welded, material);

  // Keskipiste suurin piirtein pään keskellä; palauta mesh ilman lisämuutoksia
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Luo kuparinaula (materiaali kuparin sävyllä), geometria sama kuin rautanaulassa
export function createNaulaCopper() {
  const material = new THREE.MeshStandardMaterial({
    color: 0xB87333,     // kuparin sävy
    metalness: 0.9,
    roughness: 0.35
  });

  const headRadius = 0.3;
  const headHeight = 0.12;
  const shaftRadius = 0.1;
  const shaftLength = 3.0;
  const tipLength = 0.4;

  const head = new THREE.CylinderGeometry(headRadius, headRadius, headHeight, 24);
  const shaft = new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLength, 24, 1, true)
    .translate(0, -(headHeight / 2 + shaftLength / 2), 0);
  const tip = new THREE.ConeGeometry(shaftRadius, tipLength, 24, 1, true)
    .rotateX(Math.PI)
    .translate(0, -(headHeight / 2 + shaftLength + tipLength / 2), 0);

  const merged = BufferGeometryUtils.mergeGeometries([head, shaft, tip], true);
  const welded = BufferGeometryUtils.mergeVertices(merged, 1e-6);
  welded.computeVertexNormals();
  const mesh = new THREE.Mesh(welded, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
