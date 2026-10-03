/* Combat Actions & Damage Calculation */
    function broadcastLocalEnemyHit(enemy, dmg, isCrit, knockbackVec) {
      if (state.gameMode === 'multiplayer') {
        net.send({
          type: 'ENEMY_HIT',
          enemyId: enemy.id,
          damage: Math.round(dmg),
          isCrit: isCrit,
          attacker: state.username,
          hitPos: { x: enemy.position.x, y: enemy.position.y, z: enemy.position.z },
          knockback: knockbackVec ? { x: knockbackVec.x, z: knockbackVec.z } : null
        });
      }
    }

    function performHeroAttack() {
      if (state.hero.attackCooldown > 0 || state.hero.isDowned) return;

      state.hero.attackCooldown = 0.28 / state.hero.attackSpeed;
      const combo = state.hero.attackCombo;
      hero.triggerSlashAnimation(combo);
      state.hero.attackCombo = (state.hero.attackCombo + 1) % 3;

      const facingDir = new THREE.Vector3(
        Math.sin(hero.group.rotation.y), 0, Math.cos(hero.group.rotation.y)
      ).normalize();

      const classType = (state.activeClassData && state.activeClassData.type) ||
        (state.heroClass === 'gunner' ? 'ranged' : (state.heroClass === 'arcanist' ? 'magic' : 'melee'));

      // Broadcast Attack to all peers in Multiplayer
      net.send({
        type: 'ATTACK',
        facing: { x: facingDir.x, z: facingDir.z },
        combo: combo,
        class: state.heroClass,
        classType: classType
      });

      // Action based on class type
      if (classType === 'melee') {
        sound.playSlash();
        spawnSlashWave(hero.position, facingDir, combo);

        const attackRange = 3.8;
        const arcThreshold = (combo === 2) ? -1.0 : Math.cos((Math.PI * 0.75) / 2);
        let hitAny = false;

        enemies.forEach(enemy => {
          if (enemy.dead) return;
          const toEnemy = new THREE.Vector3().subVectors(enemy.position, hero.position);
          toEnemy.y = 0;
          const dist = toEnemy.length();

          if (dist <= attackRange) {
            toEnemy.normalize();
            if (facingDir.dot(toEnemy) >= arcThreshold) {
              hitAny = true;
              const isCrit = Math.random() < state.hero.critChance;
              let dmg = state.hero.attackDamage * (combo === 2 ? 1.6 : 1.0);
              if (isCrit) dmg *= state.hero.critMult;

              enemy.takeDamage(dmg, isCrit, state.username);
              enemy.position.addScaledVector(toEnemy, 1.0);

              // Broadcast hit to squadmates
              broadcastLocalEnemyHit(enemy, dmg, isCrit, { x: toEnemy.x, z: toEnemy.z });
            }
          }
        });
        if (hitAny) sound.playHit();

      } else if (classType === 'ranged') {
        sound.playLaserShot();
        spawnGunnerBolts(hero.position, facingDir);

      } else if (classType === 'magic') {
        sound.playMagicSpark();
        spawnArcanistSpark(hero.position, facingDir);
      }
    }

    function performDash() {
      if (state.hero.dashTimer > 0 || state.hero.isDowned) return;

      state.hero.dashTimer = state.hero.dashCooldown;
      sound.playDash();

      let dir = new THREE.Vector3();
      if (hero.velocity.lengthSq() > 0.01) {
        dir.set(hero.velocity.x, 0, hero.velocity.y).normalize();
      } else {
        dir.set(Math.sin(hero.group.rotation.y), 0, Math.cos(hero.group.rotation.y)).normalize();
      }

      state.hero.dashDirection.copy(dir);
      state.hero.isDashing = true;
      state.hero.dashDuration = 0.18;
      state.hero.invincibleTimer = 0.35;

      const theme = MONTHLY_THEMES[state.currentMonth] || MONTHLY_THEMES[0];
      spawnExplosion(hero.position, theme.primaryHex);
      triggerScreenShake();
    }

    function performSpecialNova() {
      if (state.hero.specialCharge < state.hero.specialMaxCharge || state.hero.isDowned) return;

      state.hero.specialCharge = 0;
      updateSpecialButton();

      const classType = (state.activeClassData && state.activeClassData.type) ||
        (state.heroClass === 'gunner' ? 'ranged' : (state.heroClass === 'arcanist' ? 'magic' : 'melee'));

      net.send({
        type: 'SPECIAL',
        pos: { x: hero.position.x, z: hero.position.z },
        class: state.heroClass,
        classType: classType
      });

      const theme = MONTHLY_THEMES[state.currentMonth] || MONTHLY_THEMES[0];

      if (classType === 'melee') {
        sound.playNova();
        triggerScreenShake();
        spawnExplosion(hero.position, theme.secondaryHex);
        spawnGroundShockwave(hero.position, 13.0, theme.primaryHex);

        enemies.forEach(enemy => {
          if (!enemy.dead && enemy.position.distanceTo(hero.position) < 13.5) {
            const dmg = state.hero.attackDamage * 3.8;
            enemy.takeDamage(dmg, true, state.username);
            broadcastLocalEnemyHit(enemy, dmg, true, null);
          }
        });

      } else if (classType === 'ranged') {
        sound.playNova();
        triggerScreenShake();
        spawnOrbitalRocketBarrage(hero.position);

      } else if (classType === 'magic') {
        sound.playNova();
        triggerScreenShake();
        spawnSingularityVortex(hero.position);
      }
    }

    function toggleAutoAttack() {
      state.hero.autoAttack = !state.hero.autoAttack;
      const btn = document.getElementById('btn-auto');
      const lbl = document.getElementById('auto-lbl');
      if (state.hero.autoAttack) {
        btn.classList.add('active');
        lbl.textContent = 'AUTO: ON';
      } else {
        btn.classList.remove('active');
        lbl.textContent = 'AUTO: OFF';
      }
      sound.playPickup();
    }

    function performUltimate() {
      if (state.phase !== 'playing' || state.hero.isDowned) return;
      if (state.hero.ultimateCooldown && state.hero.ultimateCooldown > 0) {
        showLolBanner('ULTIMATE ON COOLDOWN', `${Math.ceil(state.hero.ultimateCooldown)}S REMAINING`);
        return;
      }

      state.hero.ultimateCooldown = 25.0; // 25s cooldown
      state.hero.invincibleTimer = 3.0; // 3 seconds divine invincibility
      const origSpeed = state.hero.moveSpeed;
      const origDmg = state.hero.attackDamage;
      state.hero.moveSpeed *= 1.4;
      state.hero.attackDamage *= 1.6;

      sound.playNova();
      triggerScreenShake();

      // Golden ultimate light pillars & radial blast
      spawnExplosion(hero.position, 0xffd700);
      spawnGroundShockwave(hero.position, 18.0, 0xffb703);

      enemies.forEach(enemy => {
        if (!enemy.dead && enemy.position.distanceTo(hero.position) < 18.0) {
          const dmg = state.hero.attackDamage * 4.5;
          enemy.takeDamage(dmg, true, state.username);
          broadcastLocalEnemyHit(enemy, dmg, true, null);
        }
      });

      showLolBanner('ULTIMATE ACTIVATED!', 'CELESTIAL OVERCHARGE: +60% DMG & +40% SPEED');

      // Visual ultimate aura around hero for 6s
      if (hero && hero.shieldMesh) {
        hero.shieldMesh.material.opacity = 0.95;
        hero.shieldMesh.material.color.setHex(0xffd700);
      }

      setTimeout(() => {
        state.hero.moveSpeed = origSpeed;
        state.hero.attackDamage = origDmg;
        if (hero && hero.shieldMesh) {
          hero.shieldMesh.material.opacity = 0.55;
          hero.shieldMesh.material.color.setHex(0x00f5d4);
        }
      }, 6000);

      updateLolHUD();
    }

    let bannerTimeout = null;
    function showLolBanner(mainText, subText = '') {
      const banner = document.getElementById('lol-announcement-banner');
      const mainEl = document.getElementById('lol-announce-main');
      const subEl = document.getElementById('lol-announce-sub');
      if (!banner || !mainEl) return;

      mainEl.textContent = mainText;
      if (subEl) subEl.textContent = subText;

      banner.classList.remove('active');
      void banner.offsetWidth; // trigger reflow
      banner.classList.add('active');

      if (bannerTimeout) clearTimeout(bannerTimeout);
      bannerTimeout = setTimeout(() => {
        banner.classList.remove('active');
      }, 3500);
    }

    function damagePlayer(amount, isLocal) {
      if (isLocal) {
        if (state.hero.invincibleTimer > 0 || state.phase !== 'playing' || state.hero.isDowned) return;

        if (state.hero.shield > 0) {
          if (state.hero.shield >= amount) {
            state.hero.shield -= amount;
            amount = 0;
          } else {
            amount -= state.hero.shield;
            state.hero.shield = 0;
          }
        }

        if (amount > 0) {
          state.hero.hp -= amount;
          triggerScreenShake();
        }

        state.hero.shieldRegenTimer = 3.0;
        updateVitalsHUD();

        if (state.hero.hp <= 0) {
          let hasAliveTeammate = false;
          remoteHeroes.forEach(rh => {
            if (!rh.isDowned) hasAliveTeammate = true;
          });

          if (state.gameMode === 'multiplayer' && hasAliveTeammate) {
            // Enter Downed Co-op state
            state.hero.isDowned = true;
            state.hero.hp = 0;
            const banner = document.getElementById('revive-banner');
            banner.style.display = 'block';
            banner.textContent = '⚠️ YOU ARE DOWNED! SQUADMATES CAN REVIVE YOU!';
          } else {
            handleGameOver(false);
          }
        }
      }
    }

    function checkCoopReviveState() {
      if (state.gameMode !== 'multiplayer') return;

      const banner = document.getElementById('revive-banner');
      let anyTeammateDowned = false;
      let allDowned = state.hero.isDowned;

      remoteHeroes.forEach((rh, peerId) => {
        if (!rh.isDowned) {
          allDowned = false;
        } else {
          anyTeammateDowned = true;

          // Local hero is alive and close to downed teammate -> revive them
          if (!state.hero.isDowned) {
            const dist = hero.position.distanceTo(rh.position);
            if (dist < 3.5) {
              state.hero.reviveProgress += 0.033;
              banner.style.display = 'block';
              const pct = Math.min(100, Math.round((state.hero.reviveProgress / 2.5) * 100));
              banner.textContent = `💚 REVIVING ${rh.username.toUpperCase()}... ${pct}%`;

              if (state.hero.reviveProgress >= 2.5) {
                state.hero.reviveProgress = 0;
                net.send({ type: 'REVIVE_EVENT', targetPeerId: peerId });
                rh.isDowned = false;
                sound.playReviveChime();
                banner.style.display = 'none';
              }
            }
          }
        }
      });

      // If local hero is downed and teammates are still alive
      if (state.hero.isDowned && !allDowned) {
        banner.style.display = 'block';
        banner.textContent = '⚠️ YOU ARE DOWNED! SQUADMATES CAN REVIVE YOU!';
      } else if (!anyTeammateDowned && !state.hero.isDowned) {
        state.hero.reviveProgress = 0;
        banner.style.display = 'none';
      }

      // If everyone is downed -> Game Over
      if (allDowned && remoteHeroes.size > 0) {
        handleGameOver(false);
      }
    }

    function spawnFloatingCombatText(worldPos, text, isCrit, colorHex, attacker = '') {
      const container = document.getElementById('fct-layer');
      if (!container) return;

      const item = document.createElement('div');
      item.className = 'fct-item';

      const attackerTag = attacker ? `<span style="display:block; font-size:10px; font-weight:700; opacity:0.85; letter-spacing:0.5px; color:var(--theme-primary, #00f0ff);">${attacker}</span>` : '';
      item.innerHTML = `${attackerTag}${isCrit ? '💥 CRIT! ' : ''}${text}`;

      if (isCrit) {
        item.style.color = '#ffb703';
        item.style.fontSize = '20px';
        item.style.textShadow = '0 0 10px rgba(255, 183, 3, 0.9)';
      } else if (colorHex) {
        item.style.color = '#' + colorHex.toString(16).padStart(6, '0');
      } else {
        item.style.color = '#ffffff';
      }

      const projected = worldPos.clone().project(camera);
      item.style.left = `${(projected.x * 0.5 + 0.5) * window.innerWidth}px`;
      item.style.top = `${(-(projected.y * 0.5) + 0.5) * window.innerHeight}px`;

      container.appendChild(item);
      setTimeout(() => {
        if (item.parentNode) item.parentNode.removeChild(item);
      }, 850);
    }

    function triggerScreenShake() {
      const el = document.body;
      el.classList.remove('shake');
      void el.offsetWidth;
      el.classList.add('shake');
      setTimeout(() => el.classList.remove('shake'), 260);
    }

    function triggerAnvilFlash() {
      const el = document.getElementById('anvil-flash');
      el.style.opacity = '0.7';
      setTimeout(() => el.style.opacity = '0', 100);
    }

export {
  broadcastLocalEnemyHit, performHeroAttack, performDash, performSpecialNova,
  toggleAutoAttack, performUltimate, showLolBanner, damagePlayer, checkCoopReviveState,
  spawnFloatingCombatText, triggerScreenShake, triggerAnvilFlash
};
window.broadcastLocalEnemyHit = broadcastLocalEnemyHit;
window.performHeroAttack = performHeroAttack;
window.performDash = performDash;
window.performSpecialNova = performSpecialNova;
window.toggleAutoAttack = toggleAutoAttack;
window.performUltimate = performUltimate;
window.showLolBanner = showLolBanner;
window.damagePlayer = damagePlayer;
window.checkCoopReviveState = checkCoopReviveState;
window.spawnFloatingCombatText = spawnFloatingCombatText;
window.triggerScreenShake = triggerScreenShake;
window.triggerAnvilFlash = triggerAnvilFlash;

