/* Three.js 3D Scene, Camera, Lighting & Arena */
    const container = document.getElementById('canvas-container');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060814);
    scene.fog = new THREE.FogExp2(0x060814, 0.022);

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 24, 22);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0x2a3654, 1.4);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xe0f2fe, 1.9);
    sunLight.position.set(15, 30, 20);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.bias = -0.001;
    scene.add(sunLight);

    const forgePointLight = new THREE.PointLight(0x00f5d4, 2.8, 28);
    forgePointLight.position.set(0, 3, 0);
    scene.add(forgePointLight);

    // Arena Platform
    const arenaGroup = new THREE.Group();
    scene.add(arenaGroup);

    const arenaGeo = new THREE.CylinderGeometry(15, 16, 2, 8);
    const arenaMat = new THREE.MeshStandardMaterial({ color: 0x0f1528, roughness: 0.5, metalness: 0.6, flatShading: true });
    const arenaMesh = new THREE.Mesh(arenaGeo, arenaMat);
    arenaMesh.position.y = -1;
    arenaMesh.receiveShadow = true;
    arenaGroup.add(arenaMesh);

    const runeRingGeo = new THREE.RingGeometry(8, 8.4, 48);
    const runeRingMat = new THREE.MeshBasicMaterial({ color: 0x00f5d4, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
    const runeRing = new THREE.Mesh(runeRingGeo, runeRingMat);
    runeRing.rotation.x = -Math.PI / 2;
    runeRing.position.y = 0.02;
    arenaGroup.add(runeRing);

    const outerRingGeo = new THREE.RingGeometry(14.6, 14.9, 8);
    const outerRingMat = new THREE.MeshBasicMaterial({ color: 0xffb703, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
    const outerRing = new THREE.Mesh(outerRingGeo, outerRingMat);
    outerRing.rotation.x = -Math.PI / 2;
    outerRing.position.y = 0.02;
    arenaGroup.add(outerRing);

    const pylonGeo = new THREE.BoxGeometry(1.2, 4.5, 1.2);
    const pylonMat = new THREE.MeshStandardMaterial({ color: 0x16203d, metalness: 0.8, roughness: 0.3 });
    const pylonCrystalGeo = new THREE.OctahedronGeometry(0.7);
    const pylonCrystalMat = new THREE.MeshStandardMaterial({ color: 0x00bbf9, emissive: 0x00bbf9, emissiveIntensity: 0.8 });

    const pylonAngles = [Math.PI/4, 3*Math.PI/4, 5*Math.PI/4, 7*Math.PI/4];
    const pylonMeshes = [];
    pylonAngles.forEach((angle) => {
      const pylon = new THREE.Mesh(pylonGeo, pylonMat);
      const px = Math.cos(angle) * 13.5;
      const pz = Math.sin(angle) * 13.5;
      pylon.position.set(px, 1.5, pz);
      pylon.castShadow = true;
      pylon.receiveShadow = true;
      arenaGroup.add(pylon);

      const crystal = new THREE.Mesh(pylonCrystalGeo, pylonCrystalMat);
      crystal.position.set(px, 4.4, pz);
      arenaGroup.add(crystal);
      pylonMeshes.push(crystal);
    });

    const dustCount = 350;
    const dustGeo = new THREE.BufferGeometry();
    const dustPositions = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount * 3; i += 3) {
      dustPositions[i] = (Math.random() - 0.5) * 80;
      dustPositions[i + 1] = Math.random() * 40 - 10;
      dustPositions[i + 2] = (Math.random() - 0.5) * 80;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    const dustParticles = new THREE.Points(dustGeo, new THREE.PointsMaterial({
      size: 0.35, color: 0x88c0d0, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending
    }));
    scene.add(dustParticles);


export {
  container, scene, camera, renderer, ambientLight, sunLight, forgePointLight,
  arenaGroup, arenaMesh, arenaMat, runeRing, runeRingMat, outerRing, outerRingMat,
  pylonMeshes, pylonCrystalMat, dustParticles, dustGeo, dustPositions
};
window.scene = scene;
window.camera = camera;
window.renderer = renderer;
window.ambientLight = ambientLight;
window.sunLight = sunLight;
window.forgePointLight = forgePointLight;
window.arenaGroup = arenaGroup;
window.arenaMesh = arenaMesh;
window.arenaMat = arenaMat;
window.runeRing = runeRing;
window.runeRingMat = runeRingMat;
window.outerRing = outerRing;
window.outerRingMat = outerRingMat;
window.pylonMeshes = pylonMeshes;
window.pylonCrystalMat = pylonCrystalMat;
window.dustParticles = dustParticles;

