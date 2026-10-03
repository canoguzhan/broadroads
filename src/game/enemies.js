/* Enemy System & Spawner */
const showLolBanner = (main, sub) => (window.showLolBanner || (() => {}))(main, sub);
const spawnFloatingCombatText = (...args) => (window.spawnFloatingCombatText || (() => {}))(...args);
const spawnExplosion = (...args) => (window.spawnExplosion || (() => {}))(...args);
const spawnMaterialDrops = (...args) => (window.spawnMaterialDrops || (() => {}))(...args);
const updateSpecialButton = () => (window.updateSpecialButton || (() => {}))();
const damagePlayer = (...args) => (window.damagePlayer || (() => {}))(...args);
const spawnEnemyProjectile = (...args) => (window.spawnEnemyProjectile || (() => {}))(...args);
const spawnGroundShockwave = (...args) => (window.spawnGroundShockwave || (() => {}))(...args);

    class EnemyEntity {
      constructor(type, spawnPos, id = null) {
        this.id = id || Math.random().toString(36).substring(2, 9);
        this.type = type;
        this.group = new THREE.Group();
        this.position = this.group.position;
        this.position.copy(spawnPos);

        this.dead = false;
        this.flashTimer = 0;

        const waveScale = state.soloSubMode === 'dungeon' ? (state.currentWave * 4.5) : (state.soloSubMode === 'endless' ? (state.currentWave * 20) : (state.currentWave * 12));

        if (type === 'crawler') {
          this.maxHp = 45 + waveScale;
          this.hp = this.maxHp;
          this.speed = 5.2;
          this.damage = 10;
          this.attackRadius = 1.4;

          this.mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), new THREE.MeshStandardMaterial({
            color: 0x1f0b2e, emissive: 0x9d4edd, emissiveIntensity: 0.4, metalness: 0.8
          }));
          this.mesh.position.y = 0.7;
          this.mesh.castShadow = true;
          this.group.add(this.mesh);

        } else if (type === 'brute') {
          this.maxHp = 140 + waveScale * 2;
          this.hp = this.maxHp;
          this.speed = 3.2;
          this.damage = 22;
          this.attackRadius = 2.0;

          this.mesh = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.8, 1.3), new THREE.MeshStandardMaterial({
            color: 0x22333b, emissive: 0x38b000, emissiveIntensity: 0.35, metalness: 0.85
          }));
          this.mesh.position.y = 1.2;
          this.mesh.castShadow = true;
          this.group.add(this.mesh);

        } else if (type === 'caster') {
          this.maxHp = 65 + waveScale;
          this.hp = this.maxHp;
          this.speed = 3.6;
          this.damage = 15;
          this.attackRadius = 7.0;
          this.shootTimer = 1.0;

          this.mesh = new THREE.Mesh(new THREE.ConeGeometry(0.65, 2.2, 4), new THREE.MeshStandardMaterial({
            color: 0x052942, emissive: 0x00bbf9, emissiveIntensity: 0.65
          }));
          this.mesh.position.y = 1.7;
          this.mesh.rotation.x = Math.PI;
          this.mesh.castShadow = true;
          this.group.add(this.mesh);

        } else if (type === 'boss') {
          this.maxHp = (state.soloSubMode === 'dungeon') ? (900 + state.currentWave * 60) : (1400 + (state.currentWave > 5 ? (state.currentWave - 5) * 500 : 0));
          this.hp = this.maxHp;
          this.speed = 3.8;
          this.damage = 38;
          this.attackRadius = 3.2;
          this.slamTimer = 3.5;

          this.mesh = new THREE.Mesh(new THREE.BoxGeometry(2.8, 3.4, 2.4), new THREE.MeshStandardMaterial({
            color: 0x3d0b16, emissive: 0xff0054, emissiveIntensity: 0.55
          }));
          this.mesh.position.y = 2.4;
          this.mesh.castShadow = true;
          this.group.add(this.mesh);

          const crown = new THREE.Mesh(new THREE.ConeGeometry(1.2, 1.4, 5), new THREE.MeshStandardMaterial({ color: 0xffb703, emissive: 0xffb703 }));
          crown.position.set(0, 4.4, 0);
          this.group.add(crown);
        }

        scene.add(this.group);
      }

      takeDamage(amount, isCrit, attacker = state.username) {
        this.hp -= amount;
        this.flashTimer = 0.12;
        this.mesh.material.emissive.setHex(0xffffff);
        this.mesh.material.emissiveIntensity = 1.0;

        spawnFloatingCombatText(this.position.clone().add(new THREE.Vector3(0, 1.6, 0)), Math.round(amount), isCrit, null, attacker);
        state.totalDamageDealt += amount;

        state.hero.specialCharge = Math.min(state.hero.specialMaxCharge, state.hero.specialCharge + 10);
        updateSpecialButton();

        if (this.hp <= 0 && !this.dead) this.die();
      }

      applyRemoteHit(amount, isCrit, attacker = 'Teammate', knockback = null) {
        this.hp -= amount;
        this.flashTimer = 0.12;
        this.mesh.material.emissive.setHex(0xffffff);
        this.mesh.material.emissiveIntensity = 1.0;

        spawnFloatingCombatText(this.position.clone().add(new THREE.Vector3(0, 1.6, 0)), Math.round(amount), isCrit, null, attacker);
        spawnExplosion(this.position.clone().add(new THREE.Vector3(0, 1.0, 0)), 0xffffff);
        sound.playHit();

        if (knockback) {
          this.position.x += knockback.x * 0.8;
          this.position.z += knockback.z * 0.8;
        }

        if (this.hp <= 0 && !this.dead) this.die();
      }

      die() {
        this.dead = true;
        state.kills++;
        state.hero.specialCharge = Math.min(state.hero.specialMaxCharge, state.hero.specialCharge + 15);
        updateSpecialButton();

        // Mobile Legends: Bang Bang multikill streak announcer
        const now = performance.now();
        if (!state.lastKillTime || (now - state.lastKillTime) > 4000) {
          state.killStreak = 1;
        } else {
          state.killStreak++;
        }
        state.lastKillTime = now;

        if (!state.firstBloodAwarded) {
          state.firstBloodAwarded = true;
          showLolBanner('FIRST BLOOD!', 'AN ENEMY HAS BEEN SLAIN!');
        } else if (state.killStreak === 2) {
          showLolBanner('DOUBLE KILL!', 'DOMINATING!');
        } else if (state.killStreak === 3) {
          showLolBanner('TRIPLE KILL!', 'MEGA KILL!');
        } else if (state.killStreak === 4) {
          showLolBanner('MANIAC!', 'UNSTOPPABLE!');
        } else if (state.killStreak >= 5) {
          showLolBanner('SAVAGE!', 'LEGENDARY!');
        }

        spawnMaterialDrops(this.position, this.type);
        spawnExplosion(this.position, this.type === 'boss' ? 0xffb703 : 0x00f5d4);

        if (this.type === 'boss') document.getElementById('boss-hud').style.display = 'none';
      }

      update(dt, heroPos) {
        if (this.dead) return;

        if (this.flashTimer > 0) {
          this.flashTimer -= dt;
          if (this.flashTimer <= 0) {
            const baseColors = { crawler: 0x9d4edd, brute: 0x38b000, caster: 0x00bbf9, boss: 0xff0054 };
            this.mesh.material.emissive.setHex(baseColors[this.type] || 0x000000);
            this.mesh.material.emissiveIntensity = 0.4;
          }
        }

        // Target nearest living player (local or any connected teammate)
        let target = heroPos;
        let dLocal = this.position.distanceTo(heroPos);
        if (state.hero.isDowned) dLocal = 99999;

        remoteHeroes.forEach((rh) => {
          if (rh.group.visible && !rh.isDowned) {
            const dRemote = this.position.distanceTo(rh.position);
            if (dRemote < dLocal) {
              target = rh.position;
              dLocal = dRemote;
            }
          }
        });

        const toTarget = new THREE.Vector3().subVectors(target, this.position);
        toTarget.y = 0;
        const dist = toTarget.length();

        if (dist > 0.01) {
          toTarget.normalize();
          this.group.rotation.y = Math.atan2(toTarget.x, toTarget.z);
        }

        if (this.type === 'crawler') {
          this.position.x += toTarget.x * this.speed * dt;
          this.position.z += toTarget.z * this.speed * dt;
          if (dist < this.attackRadius) damagePlayer(this.damage * dt, target === heroPos);

        } else if (this.type === 'brute') {
          this.position.x += toTarget.x * this.speed * dt;
          this.position.z += toTarget.z * this.speed * dt;
          if (dist < this.attackRadius) damagePlayer(this.damage * dt * 1.5, target === heroPos);

        } else if (this.type === 'caster') {
          if (dist < 6.0) {
            this.position.x -= toTarget.x * this.speed * dt * 0.7;
            this.position.z -= toTarget.z * this.speed * dt * 0.7;
          } else if (dist > 9.0) {
            this.position.x += toTarget.x * this.speed * dt;
            this.position.z += toTarget.z * this.speed * dt;
          }

          this.shootTimer -= dt;
          if (this.shootTimer <= 0) {
            this.shootTimer = 2.4;
            spawnEnemyProjectile(this.position, toTarget);
          }

        } else if (this.type === 'boss') {
          this.position.x += toTarget.x * this.speed * dt;
          this.position.z += toTarget.z * this.speed * dt;

          const pct = Math.max(0, Math.min(100, (this.hp / this.maxHp) * 100));
          document.getElementById('boss-hp-fill').style.width = pct + '%';
          document.getElementById('boss-hp-text').textContent = Math.round(pct) + '%';

          if (dist < this.attackRadius) damagePlayer(this.damage * dt * 2.0, target === heroPos);

          this.slamTimer -= dt;
          if (this.slamTimer <= 0) {
            this.slamTimer = 4.5;
            spawnGroundShockwave(this.position);
          }
        }
      }

      destroy() {
        scene.remove(this.group);
      }
    }

    const enemies = [];

    function spawnEnemy(type, pos = null, id = null) {
      let spawnPos = pos;
      if (!spawnPos) {
        const angle = Math.random() * Math.PI * 2;
        const radius = GAME_CONFIG.ARENA_RADIUS - 0.5;
        spawnPos = new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      }
      const enemy = new EnemyEntity(type, spawnPos, id);
      enemies.push(enemy);
    }

    function syncEnemiesFromHost(hostEnemiesList) {
      if (!hostEnemiesList) return;
      hostEnemiesList.forEach(item => {
        let existing = enemies.find(e => e.id === item.id);
        if (!existing) {
          spawnEnemy(item.type, new THREE.Vector3(item.x, 0, item.z), item.id);
        } else {
          existing.position.set(item.x, 0, item.z);
          existing.hp = item.hp;
        }
      });
    }

export { EnemyEntity, enemies, spawnEnemy, syncEnemiesFromHost };
window.EnemyEntity = EnemyEntity;
window.enemies = enemies;
window.spawnEnemy = spawnEnemy;
window.syncEnemiesFromHost = syncEnemiesFromHost;

