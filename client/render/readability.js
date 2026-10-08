/* Readability from the top-down camera:
     - a thin outline in the unit's relationship colour (you / ally / enemy), drawn as an
       inflated back-face hull that follows the skeleton
     - a soft rim light in the same colour
     - a dissolve with a glowing edge for deaths (instead of sinking into the ground)
   Materials are patched in place with onBeforeCompile; every patched material shares one
   program per material type. */
import * as THREE from 'three';

const DISSOLVE_EDGE = new THREE.Color(0xff8a3d);

/** Rim light + dissolve on a model's own materials. `look` holds the shared uniforms. */
function patchMaterial(mat, look) {
  const prev = mat.onBeforeCompile; // e.g. creature motion, which must run first
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev.call(mat, shader, renderer);
    shader.uniforms.uRim = look.rim;
    shader.uniforms.uRimStrength = look.rimStrength;
    shader.uniforms.uDissolve = look.dissolve;
    shader.uniforms.uEdge = { value: DISSOLVE_EDGE };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDisPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDisPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uRim; uniform float uRimStrength; uniform float uDissolve; uniform vec3 uEdge;
varying vec3 vDisPos;
float disHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float disNoise(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(disHash(i), disHash(i + vec3(1,0,0)), f.x), mix(disHash(i + vec3(0,1,0)), disHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(disHash(i + vec3(0,0,1)), disHash(i + vec3(1,0,1)), f.x), mix(disHash(i + vec3(0,1,1)), disHash(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
float disN = uDissolve > 0.0 ? disNoise(vDisPos * 4.0) * 0.7 + disNoise(vDisPos * 11.0) * 0.3 : 1.0;
if (disN < uDissolve) discard;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float rimF = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 3.0);
totalEmissiveRadiance += uRim * rimF * uRimStrength;
if (uDissolve > 0.0 && disN < uDissolve + 0.07) totalEmissiveRadiance += uEdge * 3.0;`);
  };
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `br-look-${mat.type}-${prevKey()}`;
  mat.needsUpdate = true;
}

/** An inflated back-face copy of each mesh: reads as an outline from any angle. */
function addOutline(model, look, worldThickness) {
  const meshes = [];
  model.traverse(o => { if (o.isMesh && !o.userData.outline) meshes.push(o); });
  for (const mesh of meshes) {
    const s = new THREE.Vector3();
    mesh.getWorldScale(s);
    const mat = new THREE.MeshBasicMaterial({ color: look.outlineColor, side: THREE.BackSide });
    mat.onBeforeCompile = shader => {
      shader.uniforms.uThick = { value: worldThickness / Math.max(1e-4, s.x) };
      shader.uniforms.uDissolve = look.dissolve;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uThick;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * uThick;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uDissolve;')
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (uDissolve > 0.02) discard;');
    };
    mat.customProgramCacheKey = () => 'br-outline';
    const hull = mesh.isSkinnedMesh ? new THREE.SkinnedMesh(mesh.geometry, mat) : new THREE.Mesh(mesh.geometry, mat);
    if (mesh.isSkinnedMesh) hull.bind(mesh.skeleton, mesh.bindMatrix);
    hull.position.copy(mesh.position); hull.quaternion.copy(mesh.quaternion); hull.scale.copy(mesh.scale);
    hull.frustumCulled = false;
    hull.userData.outline = true;
    hull.renderOrder = -1;
    mesh.parent.add(hull);
    look.outlines.push(hull);
  }
}

/** Gives a unit model its look. Returns the handle used to change colour or dissolve it. */
export function applyLook(model, { color = 0xffffff, outline = false, rim = 0.45, thickness = 0.035 } = {}) {
  const look = {
    rim: { value: new THREE.Color(color) }, rimStrength: { value: rim }, dissolve: { value: 0 },
    outlineColor: new THREE.Color(color), outlines: [],
  };
  model.updateMatrixWorld(true);
  model.traverse(o => { if (o.isMesh && o.material?.isMeshStandardMaterial && !o.userData.outline) patchMaterial(o.material, look); });
  if (outline) addOutline(model, look, thickness);
  look.setColor = c => { look.rim.value.set(c); for (const h of look.outlines) h.material.color.set(c); };
  look.setDissolve = t => { look.dissolve.value = Math.max(0, Math.min(1, t)); };
  return look;
}
