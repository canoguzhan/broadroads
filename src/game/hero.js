/* Hero Entity & Remote Co-op Hero */
    class HeroEntity {
      constructor(isRemote = false, peerId = '', username = 'Commander', heroClass = 'paladin', classData = null) {
        this.isRemote = isRemote;
        this.peerId = peerId;
        this.username = username;
        this.isHost = (!isRemote && !!(net && net.isHost));
        this.isAI = false;
        this.aiAttackCooldown = 0;
        this.aiSpecialCharge = 30;
        this.group = new THREE.Group();
        this.position = this.group.position;
        this.position.set(isRemote ? 3 : 0, 0, 0);

        this.armorMat = new THREE.MeshStandardMaterial({
          color: isRemote ? 0x2e1065 : 0x1e293b,
          metalness: 0.85,
          roughness: 0.25
        });

        // Torso
        this.torso = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.42, 1.25, 8), this.armorMat);
        this.torso.position.y = 1.1;
        this.torso.castShadow = true;
        this.group.add(this.torso);

        // Core Crystal
        this.coreMat = new THREE.MeshStandardMaterial({
          color: isRemote ? 0x9d4edd : 0x00f5d4,
          emissive: isRemote ? 0x9d4edd : 0x00f5d4,
          emissiveIntensity: 1.0
        });
        this.core = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), this.coreMat);
        this.core.position.set(0, 1.2, 0.45);
        this.group.add(this.core);

        // Helm & Visor
        this.helm = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 8), this.armorMat);
        this.helm.position.y = 2.0;
        this.helm.castShadow = true;
        this.group.add(this.helm);

        this.visorMat = new THREE.MeshBasicMaterial({ color: isRemote ? 0xff0054 : 0x00f5d4 });
        this.visor = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.14, 0.25), this.visorMat);
        this.visor.position.set(0, 2.0, 0.35);
        this.group.add(this.visor);

        // Weapon Arm Mounts
        this.weaponArmRight = new THREE.Group();
        this.weaponArmRight.position.set(0.75, 1.3, 0);
        this.group.add(this.weaponArmRight);

        this.weaponArmLeft = new THREE.Group();
        this.weaponArmLeft.position.set(-0.75, 1.3, 0);
        this.group.add(this.weaponArmLeft);

        // Paladin Weapon (Greatblade)
        this.bladeMat = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: isRemote ? 0x9d4edd : 0x00f5d4,
          emissiveIntensity: 0.7,
          metalness: 0.9,
          roughness: 0.1
        });
        this.blade = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.8, 0.1), this.bladeMat);
        this.blade.position.set(0, 0.9, 0.4);
        this.blade.rotation.x = Math.PI / 4;
        this.weaponArmRight.add(this.blade);

        // Paladin Shield
        this.shieldMat = new THREE.MeshStandardMaterial({
          color: 0x00bbf9,
          emissive: 0x00bbf9,
          emissiveIntensity: 0.6,
          transparent: true,
          opacity: 0.85,
          side: THREE.DoubleSide
        });
        this.shieldMesh = new THREE.Mesh(new THREE.CircleGeometry(0.7, 6), this.shieldMat);
        this.shieldMesh.position.set(0, 0, 0.35);
        this.shieldMesh.rotation.y = -Math.PI / 6;
        this.weaponArmLeft.add(this.shieldMesh);

        // Gunner Dual Blasters
        const blasterGeo = new THREE.BoxGeometry(0.18, 0.3, 0.8);
        this.blasterMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.9, emissive: 0x00f5d4, emissiveIntensity: 0.3 });
        this.blasterR = new THREE.Mesh(blasterGeo, this.blasterMat);
        this.blasterR.position.set(0, 0, 0.3);
        this.weaponArmRight.add(this.blasterR);

        this.blasterL = new THREE.Mesh(blasterGeo, this.blasterMat);
        this.blasterL.position.set(0, 0, 0.3);
        this.weaponArmLeft.add(this.blasterL);

        // Arcanist Cosmic Orb
        this.orbMat = new THREE.MeshStandardMaterial({
          color: 0x9d4edd,
          emissive: 0x9d4edd,
          emissiveIntensity: 0.9,
          roughness: 0.1
        });
        this.magicOrb = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35), this.orbMat);
        this.magicOrb.position.set(0, 0.4, 0.4);
        this.weaponArmRight.add(this.magicOrb);

        // Downed Revive Circle Aura
        const reviveRingGeo = new THREE.RingGeometry(1.8, 2.0, 32);
        const reviveRingMat = new THREE.MeshBasicMaterial({ color: 0xff0054, side: THREE.DoubleSide, transparent: true, opacity: 0 });
        this.reviveRing = new THREE.Mesh(reviveRingGeo, reviveRingMat);
        this.reviveRing.rotation.x = -Math.PI / 2;
        this.reviveRing.position.y = 0.05;
        this.group.add(this.reviveRing);

        // Floating 3D Nameplate Sprite
        const currentTheme = MONTHLY_THEMES[state.currentMonth] || MONTHLY_THEMES[0];
        this.nameplate = createNameplateSprite(this.username, this.isHost, currentTheme.primary);
        this.group.add(this.nameplate.sprite);

        scene.add(this.group);

        this.velocity = new THREE.Vector2(0, 0);
        this.targetRotation = 0;
        this.swingProgress = 0;
        this.slashActive = false;
        this.walkCycle = 0;

        // Remote interpolation buffers
        this.targetPos = new THREE.Vector3(this.position.x, 0, this.position.z);
        this.targetRot = 0;
        this.isDowned = false;

        this.setClass(heroClass, classData);
      }

      setClass(classId, classData = null) {
        this.classId = classId;
        const theme = MONTHLY_THEMES[state.currentMonth] || MONTHLY_THEMES[0];
        const hex = (classData && classData.color) ? classData.color : theme.primaryHex;
        const subHex = (classData && classData.subColor) ? classData.subColor : theme.secondaryHex;

        // Apply theme color to crystals and weapons
        this.coreMat.color.setHex(hex);
        this.coreMat.emissive.setHex(hex);
        this.visorMat.color.setHex(hex);
        this.bladeMat.emissive.setHex(hex);
        this.shieldMat.color.setHex(subHex);
        this.shieldMat.emissive.setHex(subHex);
        this.blasterMat.emissive.setHex(hex);
        this.orbMat.color.setHex(hex);
        this.orbMat.emissive.setHex(hex);

        // Hide all weapons
        this.blade.visible = false;
        this.shieldMesh.visible = false;
        this.blasterR.visible = false;
        this.blasterL.visible = false;
        this.magicOrb.visible = false;

        if (classId === 'paladin' || classId === 'melee') {
          this.blade.visible = true;
          this.shieldMesh.visible = true;
        } else if (classId === 'gunner' || classId === 'ranged') {
          this.blasterR.visible = true;
          this.blasterL.visible = true;
        } else if (classId === 'arcanist' || classId === 'magic') {
          this.magicOrb.visible = true;
        }
      }

      updateVisualTier(weaponTier) {
        const theme = MONTHLY_THEMES[state.currentMonth] || MONTHLY_THEMES[0];
        const colors = [theme.primaryHex, theme.secondaryHex, theme.accentHex, 0xffffff];
        const hex = colors[Math.min(3, weaponTier - 1)] || theme.primaryHex;
        this.bladeMat.emissive.setHex(hex);
        this.orbMat.emissive.setHex(hex);
      }

      triggerSlashAnimation(combo) {
        this.swingProgress = 0;
        this.slashActive = true;
        if (combo === 0) this.weaponArmRight.rotation.set(-0.3, -1.2, 0);
        else if (combo === 1) this.weaponArmRight.rotation.set(0.6, 1.2, 0);
        else this.weaponArmRight.rotation.set(0, -Math.PI, 0);
      }

      triggerRemoteAttack(facing, combo, classType) {
        this.group.rotation.y = Math.atan2(facing.x, facing.z);
        this.triggerSlashAnimation(combo);
        const cls = classType || this.classId;
        if (cls === 'gunner' || cls === 'ranged') sound.playLaserShot();
        else if (cls === 'arcanist' || cls === 'magic') sound.playMagicSpark();
        else sound.playSlash();
      }

      triggerAttack(facing, combo, classType) {
        this.triggerRemoteAttack(facing, combo, classType);
      }

      triggerRemoteSpecial(pos) {
        const theme = MONTHLY_THEMES[state.currentMonth] || MONTHLY_THEMES[0];
        spawnExplosion(new THREE.Vector3(pos.x, 1, pos.z), theme.secondaryHex);
        spawnGroundShockwave(new THREE.Vector3(pos.x, 0, pos.z), 12.0, theme.primaryHex);
        sound.playNova();
        triggerScreenShake();
      }

      triggerSpecial(pos) {
        this.triggerRemoteSpecial(pos);
      }

      updateAIBot(dt) {
        if (this.isDowned || state.phase !== 'playing') return;

        if (this.aiAttackCooldown > 0) this.aiAttackCooldown -= dt;
        this.aiSpecialCharge = Math.min(100, (this.aiSpecialCharge || 0) + dt * 5);

        // 1. Check if human hero is downed and needs revive
        if (state.hero.isDowned) {
          const toLocal = new THREE.Vector3().subVectors(hero.position, this.position);
          toLocal.y = 0;
          const dist = toLocal.length();
          if (dist > 1.8) {
            toLocal.normalize();
            this.position.addScaledVector(toLocal, 7.5 * dt);
            this.group.rotation.y = Math.atan2(toLocal.x, toLocal.z);
          } else {
            // Helping revive local hero
            state.hero.reviveProgress += dt * 0.45;
            const banner = document.getElementById('revive-banner');
            banner.style.display = 'block';
            banner.textContent = `🤖 AI SQUADMATE REVIVING YOU... ${Math.min(100, Math.round((state.hero.reviveProgress / 2.5) * 100))}%`;

            if (state.hero.reviveProgress >= 2.5) {
              state.hero.reviveProgress = 0;
              state.hero.isDowned = false;
              state.hero.hp = state.hero.maxHp * 0.5;
              updateVitalsHUD();
              sound.playReviveChime();
              banner.style.display = 'none';
            }
          }
          return;
        }

        // 2. Target nearest alive enemy
        let closest = null;
        let minDist = 25.0;
        enemies.forEach(e => {
          if (e.dead) return;
          const d = e.position.distanceTo(this.position);
          if (d < minDist) { minDist = d; closest = e; }
        });

        if (closest) {
          const toTarget = new THREE.Vector3().subVectors(closest.position, this.position);
          toTarget.y = 0;
          const dist = toTarget.length();
          toTarget.normalize();

          this.group.rotation.y = Math.atan2(toTarget.x, toTarget.z);

          // Move towards enemy if beyond attack range
          const idealRange = (this.classType === 'melee') ? 2.6 : 7.0;
          if (dist > idealRange) {
            this.position.addScaledVector(toTarget, 7.0 * dt);
          }

          // Attack when in range and off cooldown
          if (dist <= idealRange + 1.2 && this.aiAttackCooldown <= 0) {
            this.aiAttackCooldown = (this.classType === 'melee') ? 0.45 : 0.6;
            this.triggerRemoteAttack(toTarget, 0, this.classId);

            // Execute hit
            const dmg = 28 + Math.floor(Math.random() * 10);
            closest.takeDamage(dmg, false, this.username);
            broadcastLocalEnemyHit(closest, dmg, false, { x: toTarget.x * 0.5, z: toTarget.z * 0.5 });
          }

          // Special Skill trigger when charged
          if (this.aiSpecialCharge >= 100) {
            this.aiSpecialCharge = 0;
            this.triggerRemoteSpecial(this.position);
            enemies.forEach(e => {
              if (!e.dead && e.position.distanceTo(this.position) < 8.5) {
                e.takeDamage(75, true, this.username);
                broadcastLocalEnemyHit(e, 75, true, null);
              }
            });
          }
        }
      }

      update(dt) {
        if (this.isRemote) {
          if (this.isAI) {
            this.updateAIBot(dt);
          } else {
            // Smooth remote interpolation for human player
            this.position.lerp(this.targetPos, dt * 15);
            let diff = this.targetRot - this.group.rotation.y;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            this.group.rotation.y += diff * Math.min(dt * 15, 1);
          }

          // Handle Downed state visual
          if (this.isDowned) {
            this.torso.position.y = 0.5;
            this.torso.rotation.x = Math.PI / 4;
            this.reviveRing.material.opacity = 0.8;
          } else {
            this.torso.position.y = 1.1;
            this.torso.rotation.x = 0;
            this.reviveRing.material.opacity = 0;
          }

          if (this.slashActive) {
            this.swingProgress += dt * 6.5;
            this.weaponArmRight.rotation.y = THREE.MathUtils.lerp(-1.4, 1.4, Math.min(1, this.swingProgress));
            if (this.swingProgress >= 1) {
              this.slashActive = false;
              this.weaponArmRight.rotation.set(0, 0, 0);
            }
          }
          return;
        }

        // Local Player Update
        if (state.hero.isDowned) {
          this.torso.position.y = 0.5;
          this.torso.rotation.x = Math.PI / 4;
          this.reviveRing.material.opacity = 0.8;
          // Slow crawl
          this.position.x += this.velocity.x * 2.0 * dt;
          this.position.z += this.velocity.y * 2.0 * dt;
          return;
        } else {
          this.torso.position.y = 1.1;
          this.torso.rotation.x = 0;
          this.reviveRing.material.opacity = 0;
        }

        if (this.moveTarget && !joystickActive) {
          const dx = this.moveTarget.x - this.position.x;
          const dz = this.moveTarget.z - this.position.z;
          const distToTarget = Math.sqrt(dx * dx + dz * dz);
          if (distToTarget > 0.4) {
            this.velocity.set(dx / distToTarget, dz / distToTarget);
          } else {
            this.velocity.set(0, 0);
            this.moveTarget = null;
          }
        }

        if (state.hero.isDashing) {
          state.hero.dashDuration -= dt;
          this.position.x += state.hero.dashDirection.x * 22 * dt;
          this.position.z += state.hero.dashDirection.z * 22 * dt;
          if (state.hero.dashDuration <= 0) state.hero.isDashing = false;
        } else {
          const speed = state.hero.moveSpeed;
          this.position.x += this.velocity.x * speed * dt;
          this.position.z += this.velocity.y * speed * dt;
        }

        const dist = Math.sqrt(this.position.x * this.position.x + this.position.z * this.position.z);
        if (dist > GAME_CONFIG.ARENA_RADIUS) {
          const angle = Math.atan2(this.position.z, this.position.x);
          this.position.x = Math.cos(angle) * GAME_CONFIG.ARENA_RADIUS;
          this.position.z = Math.sin(angle) * GAME_CONFIG.ARENA_RADIUS;
        }

        if (this.velocity.lengthSq() > 0.01) {
          this.targetRotation = Math.atan2(this.velocity.x, this.velocity.y);
          this.walkCycle += dt * 14;
          this.torso.position.y = 1.1 + Math.sin(this.walkCycle) * 0.08;
        } else {
          this.torso.position.y = 1.1;
        }

        let diff = this.targetRotation - this.group.rotation.y;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        this.group.rotation.y += diff * Math.min(dt * 18, 1);

        if (this.slashActive) {
          this.swingProgress += dt * 6.5;
          this.weaponArmRight.rotation.y = THREE.MathUtils.lerp(-1.4, 1.4, Math.min(1, this.swingProgress));
          if (this.swingProgress >= 1) {
            this.slashActive = false;
            this.weaponArmRight.rotation.set(0, 0, 0);
          }
        }

        // Float Arcanist Orb
        if (this.classId === 'arcanist' || this.classId === 'magic') {
          this.magicOrb.position.y = 0.4 + Math.sin(Date.now() * 0.005) * 0.15;
          this.magicOrb.rotation.y += dt * 3;
        }
      }
    }

    window.hero = new HeroEntity(false, 'local', state.username, state.heroClass);

export { HeroEntity };
window.HeroEntity = HeroEntity;

