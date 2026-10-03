/* Loot & Material Drops */
    const droppedMaterials = [];
    const MAT_TYPES = [
      { id: 'pyrite', color: 0xfb8500, icon: '🔥' },
      { id: 'aether', color: 0x00f5d4, icon: '🔷' },
      { id: 'titanium', color: 0x38b000, icon: '🟢' },
      { id: 'catalyst', color: 0x9d4edd, icon: '🟣' }
    ];

    function spawnMaterialDrops(pos, enemyType) {
      let count = 1;
      if (enemyType === 'brute') count = 2;
      if (enemyType === 'caster') count = 2;
      if (enemyType === 'boss') count = 8;

      for (let i = 0; i < count; i++) {
        let matMeta = MAT_TYPES[0];
        if (enemyType === 'crawler') matMeta = Math.random() > 0.4 ? MAT_TYPES[0] : MAT_TYPES[2];
        else if (enemyType === 'brute') matMeta = Math.random() > 0.5 ? MAT_TYPES[2] : MAT_TYPES[1];
        else if (enemyType === 'caster') matMeta = Math.random() > 0.5 ? MAT_TYPES[1] : MAT_TYPES[3];
        else if (enemyType === 'boss') matMeta = MAT_TYPES[i % 4];

        const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.38), new THREE.MeshStandardMaterial({
          color: matMeta.color, emissive: matMeta.color, emissiveIntensity: 0.8, roughness: 0.1, metalness: 0.8
        }));
        mesh.position.copy(pos);
        mesh.position.y = 0.5;
        scene.add(mesh);

        droppedMaterials.push({
          id: matMeta.id,
          mesh: mesh,
          velocity: new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3 + 2, (Math.random() - 0.5) * 4),
          bobOffset: Math.random() * Math.PI * 2
        });
      }
    }

    function updateMaterialDrops(dt, heroPos) {
      for (let i = droppedMaterials.length - 1; i >= 0; i--) {
        const drop = droppedMaterials[i];
        if (drop.velocity.y > 0 || drop.mesh.position.y > 0.4) {
          drop.mesh.position.x += drop.velocity.x * dt;
          drop.mesh.position.y += drop.velocity.y * dt;
          drop.mesh.position.z += drop.velocity.z * dt;
          drop.velocity.y -= 14 * dt;
        } else {
          drop.mesh.position.y = 0.4 + Math.sin(Date.now() * 0.005 + drop.bobOffset) * 0.12;
        }
        drop.mesh.rotation.y += dt * 3;

        const dist = drop.mesh.position.distanceTo(heroPos);
        if (dist < 5.0 || state.phase === 'refinery') {
          const pullDir = new THREE.Vector3().subVectors(heroPos, drop.mesh.position).normalize();
          drop.mesh.position.addScaledVector(pullDir, Math.max(14, 30 - dist * 3) * dt);

          if (dist < 1.1) {
            sound.playPickup();
            state.materials[drop.id]++;
            updateInventoryHUD();

            const matMeta = MAT_TYPES.find(m => m.id === drop.id);
            spawnFloatingCombatText(heroPos.clone().add(new THREE.Vector3(0, 1.8, 0)), `+1 ${drop.id.toUpperCase()}`, false, matMeta ? matMeta.color : 0xffffff);

            scene.remove(drop.mesh);
            droppedMaterials.splice(i, 1);
          }
        }
      }
    }


export { droppedMaterials, MAT_TYPES, spawnMaterialDrops, updateMaterialDrops };
window.droppedMaterials = droppedMaterials;
window.MAT_TYPES = MAT_TYPES;
window.spawnMaterialDrops = spawnMaterialDrops;
window.updateMaterialDrops = updateMaterialDrops;

