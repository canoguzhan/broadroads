/* Projectiles, Slash Waves, Rockets & Black Holes */
    const projectiles = [];
    const slashWaves = [];
    const gunnerRockets = [];
    const blackHoles = [];
    const shockwaves = [];
    const explosions = [];

    function spawnSlashWave(origin, dir, combo, isRemote = false) {
      const theme = MONTHLY_THEMES[state.currentMonth] || MONTHLY_THEMES[0];
      const waveGeo = new THREE.RingGeometry(1.2, 2.4, 16, 1, 0, Math.PI * 0.9);
      const waveColor = (combo === 2) ? theme.accentHex : (combo === 1 ? theme.secondaryHex : theme.primaryHex);
      const mesh = new THREE.Mesh(waveGeo, new THREE.MeshBasicMaterial({
        color: waveColor, side: THREE.DoubleSide, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending
      }));
      mesh.rotation.x = Math.PI / 2;
      mesh.rotation.z = Math.atan2(dir.x, dir.z) + Math.PI / 2;
      mesh.position.copy(origin).add(new THREE.Vector3(0, 1.1, 0));
      scene.add(mesh);

      slashWaves.push({
        mesh: mesh, dir: dir.clone().normalize(), speed: 17.0, lifetime: 0.3, damage: state.hero.attackDamage, isRemote: isRemote
      });
    }

    function spawnGunnerBolts(origin, dir, isRemote = false) {
      const theme = MONTHLY_THEMES[state.currentMonth] || MONTHLY_THEMES[0];
      for (let i = -1; i <= 1; i += 2) {
        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 6), new THREE.MeshBasicMaterial({ color: theme.primaryHex }));
        bolt.rotation.x = Math.PI / 2;
        bolt.rotation.z = Math.atan2(dir.x, dir.z);
        bolt.position.copy(origin).add(new THREE.Vector3(i * 0.4, 1.2, 0));
        scene.add(bolt);

        projectiles.push({
          mesh: bolt, dir: dir.clone().normalize(), speed: 28.0, damage: state.hero.attackDamage * 0.65, lifetime: 0.6, isPlayer: true, isRemote: isRemote
        });
      }
    }

    function spawnArcanistSpark(origin, dir, isRemote = false) {
      const theme = MONTHLY_THEMES[state.currentMonth] || MONTHLY_THEMES[0];
      const spark = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), new THREE.MeshBasicMaterial({ color: theme.secondaryHex }));
      spark.position.copy(origin).add(new THREE.Vector3(0, 1.3, 0));
      scene.add(spark);

      projectiles.push({
        mesh: spark, dir: dir.clone().normalize(), speed: 18.0, damage: state.hero.attackDamage * 0.9, lifetime: 0.8, isPlayer: true, isArcanist: true, isRemote: isRemote
      });
    }

    function spawnOrbitalRocketBarrage(center) {
      for (let i = 0; i < 8; i++) {
        setTimeout(() => {
          if (enemies.length === 0) return;
          const target = enemies[Math.floor(Math.random() * enemies.length)];
          const rocket = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.8, 6), new THREE.MeshBasicMaterial({ color: 0xffb703 }));
          rocket.position.set(target.position.x + (Math.random() - 0.5) * 4, 15, target.position.z + (Math.random() - 0.5) * 4);
          rocket.rotation.x = Math.PI;
          scene.add(rocket);

          gunnerRockets.push({ mesh: rocket, target: target, speed: 24.0, damage: state.hero.attackDamage * 1.5 });
        }, i * 90);
      }
    }

    function spawnSingularityVortex(center) {
      const vortexGeo = new THREE.RingGeometry(0.5, 4.0, 32);
      const vortex = new THREE.Mesh(vortexGeo, new THREE.MeshBasicMaterial({
        color: 0x9d4edd, side: THREE.DoubleSide, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending
      }));
      vortex.rotation.x = -Math.PI / 2;
      vortex.position.copy(center);
      vortex.position.y = 0.08;
      scene.add(vortex);

      blackHoles.push({ mesh: vortex, center: center.clone(), radius: 4.0, lifetime: 3.5, damage: state.hero.attackDamage * 1.8 });
    }

    function spawnEnemyProjectile(origin, dir) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), new THREE.MeshBasicMaterial({ color: 0x00bbf9 }));
      mesh.position.copy(origin).add(new THREE.Vector3(0, 1.5, 0));
      scene.add(mesh);

      projectiles.push({ mesh: mesh, dir: dir.clone().normalize(), speed: 8.5, damage: 18, lifetime: 3.5, isPlayer: false });
    }

    function spawnGroundShockwave(center, maxRadius = 8.5, colorHex = 0xff0054) {
      sound.playHit();
      triggerScreenShake();
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.5, 1.4, 32), new THREE.MeshBasicMaterial({
        color: colorHex, side: THREE.DoubleSide, transparent: true, opacity: 0.9
      }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.copy(center);
      mesh.position.y = 0.05;
      scene.add(mesh);

      shockwaves.push({ mesh: mesh, radius: 1.0, maxRadius: maxRadius, speed: 12.0, damage: 30, center: center.clone() });
    }

    function spawnExplosion(pos, colorHex) {
      const pCount = 20;
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array(pCount * 3);
      const velocities = [];

      for (let i = 0; i < pCount; i++) {
        positions[i * 3] = pos.x;
        positions[i * 3 + 1] = pos.y + 0.8;
        positions[i * 3 + 2] = pos.z;
        velocities.push(new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 6 + 2, (Math.random() - 0.5) * 8));
      }

      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const pSystem = new THREE.Points(geo, new THREE.PointsMaterial({
        color: colorHex || 0x00f5d4, size: 0.45, transparent: true, opacity: 1, blending: THREE.AdditiveBlending
      }));
      scene.add(pSystem);

      explosions.push({ pSystem: pSystem, velocities: velocities, positions: positions, lifetime: 0.6 });
    }

export {
  projectiles, slashWaves, gunnerRockets, blackHoles, shockwaves, explosions,
  spawnSlashWave, spawnGunnerBolts, spawnArcanistSpark, spawnOrbitalRocketBarrage,
  spawnSingularityVortex, spawnEnemyProjectile, spawnGroundShockwave, spawnExplosion
};
window.projectiles = projectiles;
window.slashWaves = slashWaves;
window.gunnerRockets = gunnerRockets;
window.blackHoles = blackHoles;
window.shockwaves = shockwaves;
window.explosions = explosions;
window.spawnSlashWave = spawnSlashWave;
window.spawnGunnerBolts = spawnGunnerBolts;
window.spawnArcanistSpark = spawnArcanistSpark;
window.spawnOrbitalRocketBarrage = spawnOrbitalRocketBarrage;
window.spawnSingularityVortex = spawnSingularityVortex;
window.spawnEnemyProjectile = spawnEnemyProjectile;
window.spawnGroundShockwave = spawnGroundShockwave;
window.spawnExplosion = spawnExplosion;

