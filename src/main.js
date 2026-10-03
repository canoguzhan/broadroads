/* BROADROADS - Modular Game Engine Entrypoint */
import './globals.js';
import './audio/sound.js';
import './config/constants.js';
import './config/themes.js';
import './game/state.js';
import './services/auth.js';
import './game/scene.js';
import './game/themeEngine.js';
import './game/hero.js';
import './game/enemies.js';
import './game/weapons.js';
import './game/loot.js';
import './net/multiplayer.js';
import './net/poll.js';
import './game/combat.js';
import './game/waves.js';
import './game/refinery.js';
import './game/gameOver.js';
import './ui/controls.js';
import './ui/hud.js';

/* ==========================================================================
   15. MAIN GAME LOOP & APPLICATION BOOTSTRAP
   ========================================================================== */
    let lastTime = performance.now();

    function animate(currentTime) {
      requestAnimationFrame(animate);

      if (state.isExitPaused) {
        renderer.render(scene, camera);
        return;
      }

      const dt = Math.min((currentTime - lastTime) / 1000, 0.1);
      lastTime = currentTime;

      updateKeyboardMovement();
      hero.update(dt);
      remoteHeroes.forEach(rh => rh.update(dt));

      // Camera Tracking (Follow squad center in multiplayer)
      let camTargetX = hero.position.x;
      let camTargetZ = hero.position.z;
      if (state.gameMode === 'multiplayer' && remoteHeroes.size > 0) {
        let count = 1;
        remoteHeroes.forEach(rh => {
          if (rh.group && rh.group.visible) {
            camTargetX += rh.position.x;
            camTargetZ += rh.position.z;
            count++;
          }
        });
        camTargetX /= count;
        camTargetZ /= count;
      }

      camera.position.x = THREE.MathUtils.lerp(camera.position.x, camTargetX * 0.45, dt * 4.0);
      camera.position.z = THREE.MathUtils.lerp(camera.position.z, 22 + camTargetZ * 0.45, dt * 4.0);
      camera.lookAt(camTargetX * 0.35, 0, camTargetZ * 0.35);

      dustParticles.rotation.y += dt * 0.03;
      pylonMeshes.forEach((mesh, idx) => { mesh.rotation.y += dt * (1 + idx * 0.3); });

      if (state.hero.attackCooldown > 0) state.hero.attackCooldown -= dt;
      if (state.hero.dashTimer > 0) state.hero.dashTimer -= dt;
      if (state.hero.invincibleTimer > 0) state.hero.invincibleTimer -= dt;
      if (state.hero.ultimateCooldown && state.hero.ultimateCooldown > 0) state.hero.ultimateCooldown -= dt;
      updateCooldownOverlays();
      updateLolHUD();
      drawMinimap();

      // Animate League Click-to-Move Ripples
      for (let i = clickRipples.length - 1; i >= 0; i--) {
        const r = clickRipples[i];
        r.life -= dt;
        const progress = 1 - (r.life / r.maxLife);
        r.mesh.scale.setScalar(1 + progress * 1.5);
        r.mesh.material.opacity = Math.max(0, r.life / r.maxLife);
        if (r.life <= 0) {
          scene.remove(r.mesh);
          r.mesh.geometry.dispose();
          r.mesh.material.dispose();
          clickRipples.splice(i, 1);
        }
      }

      if (state.hero.shieldRegenTimer > 0) {
        state.hero.shieldRegenTimer -= dt;
      } else if (state.hero.shield < state.hero.maxShield) {
        state.hero.shield = Math.min(state.hero.maxShield, state.hero.shield + 20 * dt);
        updateVitalsHUD();
      }

      // Auto-Attack AI
      if (state.hero.autoAttack && state.phase === 'playing' && !state.hero.isDowned) {
        let closest = null;
        let minDist = 14.0;
        enemies.forEach(e => {
          if (e.dead) return;
          const d = e.position.distanceTo(hero.position);
          if (d < minDist) { minDist = d; closest = e; }
        });

        if (closest) {
          hero.targetRotation = Math.atan2(closest.position.x - hero.position.x, closest.position.z - hero.position.z);
          hero.group.rotation.y = hero.targetRotation;
          if (minDist <= 3.8 && state.hero.attackCooldown <= 0) performHeroAttack();
        }
      }

      // Check Revives in Co-op
      if (state.gameMode === 'multiplayer') checkCoopReviveState();

      if (state.phase === 'playing') {
        updateWaveSpawning(dt);

        for (let i = enemies.length - 1; i >= 0; i--) {
          const enemy = enemies[i];
          enemy.update(dt, hero.position);
          if (enemy.dead) {
            enemy.destroy();
            enemies.splice(i, 1);
          }
        }
      } else if (state.phase === 'refinery') {
        updateRefineryTimer(dt);
      }

      updateMaterialDrops(dt, hero.position);

      const activeTheme = MONTHLY_THEMES[state.currentMonth] || MONTHLY_THEMES[0];

      // Slash Waves
      for (let i = slashWaves.length - 1; i >= 0; i--) {
        const wave = slashWaves[i];
        wave.mesh.position.addScaledVector(wave.dir, wave.speed * dt);
        wave.lifetime -= dt;
        wave.mesh.material.opacity = Math.max(0, wave.lifetime / 0.3);

        if (!wave.isRemote) {
          enemies.forEach(enemy => {
            if (!enemy.dead && enemy.position.distanceTo(wave.mesh.position) < 2.0) {
              const dmg = wave.damage * 0.7;
              enemy.takeDamage(dmg, false, state.username);
              enemy.position.addScaledVector(wave.dir, 0.4);
              broadcastLocalEnemyHit(enemy, dmg, false, { x: wave.dir.x * 0.4, z: wave.dir.z * 0.4 });
            }
          });
        }

        if (wave.lifetime <= 0) {
          scene.remove(wave.mesh);
          slashWaves.splice(i, 1);
        }
      }

      // Projectiles (Gunner bolts, Arcanist sparks, Enemy plasma)
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const proj = projectiles[i];
        proj.mesh.position.addScaledVector(proj.dir, proj.speed * dt);
        proj.lifetime -= dt;

        if (proj.isPlayer) {
          if (!proj.isRemote) {
            // Hits enemies
            enemies.forEach(enemy => {
              if (!enemy.dead && enemy.position.distanceTo(proj.mesh.position) < 1.4) {
                const isCrit = Math.random() < state.hero.critChance;
                let dmg = proj.damage;
                if (isCrit) dmg *= state.hero.critMult;
                enemy.takeDamage(dmg, isCrit, state.username);
                spawnExplosion(proj.mesh.position, activeTheme.primaryHex);
                broadcastLocalEnemyHit(enemy, dmg, isCrit, { x: proj.dir.x * 0.5, z: proj.dir.z * 0.5 });
                proj.lifetime = 0;
              }
            });
          }
        } else {
          // Hits local hero
          if (proj.mesh.position.distanceTo(hero.position) < 1.2) {
            damagePlayer(proj.damage, true);
            spawnExplosion(proj.mesh.position, activeTheme.secondaryHex);
            proj.lifetime = 0;
          }
        }

        if (proj.lifetime <= 0) {
          scene.remove(proj.mesh);
          projectiles.splice(i, 1);
        }
      }

      // Gunner Orbital Rockets
      for (let i = gunnerRockets.length - 1; i >= 0; i--) {
        const rocket = gunnerRockets[i];
        if (rocket.target && !rocket.target.dead) {
          const toTarget = new THREE.Vector3().subVectors(rocket.target.position, rocket.mesh.position).normalize();
          rocket.mesh.position.addScaledVector(toTarget, rocket.speed * dt);
          if (rocket.mesh.position.distanceTo(rocket.target.position) < 1.2) {
            rocket.target.takeDamage(rocket.damage, true, state.username);
            spawnExplosion(rocket.mesh.position, 0xffb703);
            broadcastLocalEnemyHit(rocket.target, rocket.damage, true, null);
            scene.remove(rocket.mesh);
            gunnerRockets.splice(i, 1);
            continue;
          }
        } else {
          rocket.mesh.position.y -= rocket.speed * dt;
          if (rocket.mesh.position.y <= 0) {
            spawnExplosion(rocket.mesh.position, 0xffb703);
            scene.remove(rocket.mesh);
            gunnerRockets.splice(i, 1);
            continue;
          }
        }
      }

      // Arcanist Black Hole Vortexes
      for (let i = blackHoles.length - 1; i >= 0; i--) {
        const hole = blackHoles[i];
        hole.lifetime -= dt;
        hole.mesh.rotation.z += dt * 4;

        enemies.forEach(enemy => {
          if (!enemy.dead) {
            const d = enemy.position.distanceTo(hole.center);
            if (d < hole.radius) {
              // Pull toward vortex center
              const pull = new THREE.Vector3().subVectors(hole.center, enemy.position).normalize();
              enemy.position.addScaledVector(pull, 6.0 * dt);
              enemy.takeDamage(hole.damage * dt, false);
            }
          }
        });

        if (hole.lifetime <= 0) {
          spawnExplosion(hole.center, 0x9d4edd);
          scene.remove(hole.mesh);
          blackHoles.splice(i, 1);
        }
      }

      // Shockwaves
      for (let i = shockwaves.length - 1; i >= 0; i--) {
        const wave = shockwaves[i];
        wave.radius += wave.speed * dt;
        wave.mesh.scale.set(wave.radius, wave.radius, 1);
        wave.mesh.material.opacity = Math.max(0, 1 - (wave.radius / wave.maxRadius));

        if (wave.center.distanceTo(hero.position) < wave.radius && wave.center.distanceTo(hero.position) > wave.radius - 0.8) {
          damagePlayer(wave.damage * dt * 3, true);
        }

        if (wave.radius >= wave.maxRadius) {
          scene.remove(wave.mesh);
          shockwaves.splice(i, 1);
        }
      }

      // Explosions
      for (let i = explosions.length - 1; i >= 0; i--) {
        const exp = explosions[i];
        exp.lifetime -= dt;
        const posAttr = exp.pSystem.geometry.attributes.position;
        for (let j = 0; j < exp.velocities.length; j++) {
          posAttr.array[j * 3] += exp.velocities[j].x * dt;
          posAttr.array[j * 3 + 1] += exp.velocities[j].y * dt;
          posAttr.array[j * 3 + 2] += exp.velocities[j].z * dt;
          exp.velocities[j].y -= 9.8 * dt;
        }
        posAttr.needsUpdate = true;
        exp.pSystem.material.opacity = Math.max(0, exp.lifetime / 0.6);

        if (exp.lifetime <= 0) {
          scene.remove(exp.pSystem);
          explosions.splice(i, 1);
        }
      }

      renderer.render(scene, camera);
    }

    requestAnimationFrame(animate);
