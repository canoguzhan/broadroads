/* Vertex-shader motion for creatures whose Tripo rig came out unusable (they ship in their
   bind pose): the Ember Wyrm flaps its wings, sways its tail and lunges its head; the wolf
   trots with a diagonal leg swing, wags its tail and snaps. Works in the mesh's normalized
   space (Tripo models span -1..1 along their longest axis). */

const MOTION = {
  // Wyrm: head toward +z, wings along x.
  mob_wyrm: `
    float wing = smoothstep(0.32, 0.95, abs(transformed.x));
    float flap = sin(uTime * (2.6 + uMove * 1.4)) * (0.55 + uMove * 0.25);
    transformed.y += (abs(transformed.x) - 0.3) * flap * wing;
    transformed.x *= 1.0 - wing * abs(flap) * 0.12;
    float tail = smoothstep(-0.35, -1.0, transformed.z);
    transformed.x += sin(uTime * 2.0 + transformed.z * 3.0) * 0.16 * tail;
    float head = smoothstep(0.5, 1.0, transformed.z);
    transformed.y += (sin(uTime * 1.3) * 0.04 + uAttack * 0.12) * head;
    transformed.z += uAttack * 0.18 * head;
    transformed.y *= 1.0 + sin(uTime * 1.6) * 0.015;`,
  // Wolf: head toward -z, tail toward +z, legs below the belly.
  mob_wolf: `
    float legs = smoothstep(-0.2, -0.7, transformed.y);
    float side = transformed.x > 0.0 ? 0.0 : 3.14159;
    float end = transformed.z < 0.0 ? 0.0 : 3.14159;
    transformed.z += sin(uTime * 11.0 + side + end) * 0.14 * uMove * legs;
    transformed.y += max(0.0, sin(uTime * 11.0 + side + end)) * 0.05 * uMove * legs;
    float tail = smoothstep(0.65, 1.0, transformed.z);
    transformed.x += sin(uTime * (5.0 + uMove * 6.0)) * 0.13 * tail;
    float head = smoothstep(-0.55, -1.0, transformed.z);
    transformed.y += sin(uTime * 2.4) * 0.02 * head - uAttack * 0.06 * head;
    transformed.z -= uAttack * 0.16 * head;
    transformed.y *= 1.0 + sin(uTime * 2.2) * 0.012 * (1.0 - legs);`,
};

/** Adds procedural motion to a static creature model. Returns uniforms to drive per frame, or null. */
export function applyCreatureMotion(model, assetId) {
  const code = MOTION[assetId];
  if (!code) return null;
  const u = { uTime: { value: 0 }, uMove: { value: 0 }, uAttack: { value: 0 } };
  model.traverse(o => {
    if (!o.isMesh || !o.material) return;
    const mat = o.material;
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, renderer) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uMove; uniform float uAttack;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${code}`);
      if (prev && prev !== Object.getPrototypeOf(mat).onBeforeCompile) prev.call(mat, shader, renderer);
    };
    const prevKey = mat.customProgramCacheKey.bind(mat);
    mat.customProgramCacheKey = () => `creature-${assetId}-${prevKey()}`;
    mat.needsUpdate = true;
  });
  return u;
}
