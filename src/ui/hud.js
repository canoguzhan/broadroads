/* League of Legends Hextech HUD, Minimap & MLBB Kill Announcements */
    function initLolMinimap() {
      const canvas = document.getElementById('lol-minimap-canvas');
      if (!canvas) return;

      canvas.addEventListener('pointerdown', (e) => {
        sound.init();
        if (state.phase !== 'playing') return;
        e.stopPropagation();

        const rect = canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const width = rect.width;
        const centerX = width / 2;
        const centerY = width / 2;
        const mapRadius = width * 0.42;

        const worldX = ((cx - centerX) / mapRadius) * GAME_CONFIG.ARENA_RADIUS;
        const worldZ = ((cy - centerY) / mapRadius) * GAME_CONFIG.ARENA_RADIUS;

        const dist = Math.sqrt(worldX * worldX + worldZ * worldZ);
        const clampedDist = Math.min(dist, GAME_CONFIG.ARENA_RADIUS - 0.5);
        const angle = Math.atan2(worldZ, worldX);
        const targetX = Math.cos(angle) * clampedDist;
        const targetZ = Math.sin(angle) * clampedDist;

        hero.moveTarget = new THREE.Vector3(targetX, 0, targetZ);
        spawnClickRipple(targetX, targetZ);
        showLolBanner('COMMAND DISPATCHED', 'CHAMPION MOVING TO SECTOR');
      });

      const btnPing = document.getElementById('btn-minimap-ping');
      if (btnPing) {
        btnPing.addEventListener('click', (e) => {
          e.stopPropagation();
          showLolBanner('ALERT PING', 'THREATS ENGAGING IN ARENA');
          sound.playHit();
        });
      }

      const btnCam = document.getElementById('btn-minimap-center');
      if (btnCam) {
        btnCam.addEventListener('click', (e) => {
          e.stopPropagation();
          camera.position.x = hero.position.x * 0.45;
          camera.position.z = 22 + hero.position.z * 0.45;
          showLolBanner('CAMERA LOCKED', 'FOCUSED ON HERO');
        });
      }
    }

    function drawMinimap() {
      const canvas = document.getElementById('lol-minimap-canvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const mapR = w * 0.42;
      const scale = mapR / GAME_CONFIG.ARENA_RADIUS;

      ctx.clearRect(0, 0, w, h);

      // Radar base
      ctx.fillStyle = '#060e1e';
      ctx.beginPath();
      ctx.arc(cx, cy, mapR, 0, Math.PI * 2);
      ctx.fill();

      // Outer gold border
      ctx.strokeStyle = '#c8aa6e';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Subtle crosshairs
      ctx.strokeStyle = 'rgba(200, 170, 110, 0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy - mapR); ctx.lineTo(cx, cy + mapR);
      ctx.moveTo(cx - mapR, cy); ctx.lineTo(cx + mapR, cy);
      ctx.stroke();

      // Central Crucible Anvil
      ctx.fillStyle = '#ffb703';
      ctx.beginPath();
      ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Dropped Minerals
      droppedMaterials.forEach(m => {
        if (!m.mesh) return;
        const mx = cx + m.mesh.position.x * scale;
        const my = cy + m.mesh.position.z * scale;
        ctx.fillStyle = '#00f5d4';
        ctx.beginPath();
        ctx.arc(mx, my, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });

      // Enemies
      enemies.forEach(e => {
        if (e.dead) return;
        const ex = cx + e.position.x * scale;
        const ey = cy + e.position.z * scale;
        if (e.type === 'boss') {
          ctx.fillStyle = '#ff0054';
          ctx.beginPath();
          ctx.arc(ex, ey, 6.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#ffb703';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else {
          ctx.fillStyle = '#ff0054';
          ctx.beginPath();
          ctx.arc(ex, ey, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // Teammates
      remoteHeroes.forEach(rh => {
        if (!rh.group || !rh.group.visible) return;
        const tx = cx + rh.position.x * scale;
        const ty = cy + rh.position.z * scale;
        ctx.fillStyle = '#00bbf9';
        ctx.beginPath();
        ctx.arc(tx, ty, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      // Local Player
      if (hero && hero.position) {
        const px = cx + hero.position.x * scale;
        const py = cy + hero.position.z * scale;
        const rot = hero.targetRotation || hero.group.rotation.y || 0;

        // Vision Cone
        ctx.fillStyle = 'rgba(46, 204, 113, 0.25)';
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.arc(px, py, 20, rot - Math.PI / 4, rot + Math.PI / 4);
        ctx.closePath();
        ctx.fill();

        // Player Dot
        ctx.fillStyle = '#2ecc71';
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#f0e6d2';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Move target ring
      if (hero && hero.moveTarget) {
        const tx = cx + hero.moveTarget.x * scale;
        const ty = cy + hero.moveTarget.z * scale;
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(tx, ty, 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    function updateLolHUD() {
      // 1. Champion identity
      const cls = state.activeClassData || { name: 'Spirit Samurai', icon: '🛡️' };
      const avatarEl = document.getElementById('lol-champ-avatar');
      if (avatarEl) avatarEl.textContent = cls.icon || '🛡️';
      const titleEl = document.getElementById('lol-champ-title');
      if (titleEl) titleEl.textContent = cls.name.toUpperCase();
      const summonerEl = document.getElementById('lol-summoner-name');
      if (summonerEl) summonerEl.textContent = (state.username || 'COMMANDER').toUpperCase();
      const levelEl = document.getElementById('lol-champ-level');
      if (levelEl) levelEl.textContent = state.currentWave;

      // 2. Health & Mana/Shield
      const hpPct = Math.max(0, Math.min(100, (state.hero.hp / state.hero.maxHp) * 100));
      const hpBar = document.getElementById('lol-hp-bar');
      if (hpBar) hpBar.style.width = hpPct + '%';
      const hpText = document.getElementById('lol-hp-text');
      if (hpText) hpText.textContent = `${Math.ceil(state.hero.hp)} / ${state.hero.maxHp}`;

      const shieldPct = Math.max(0, Math.min(100, (state.hero.shield / state.hero.maxShield) * 100));
      const shieldBar = document.getElementById('lol-shield-bar');
      if (shieldBar) shieldBar.style.width = shieldPct + '%';
      const shieldText = document.getElementById('lol-shield-text');
      if (shieldText) shieldText.textContent = `${Math.ceil(state.hero.shield)} / ${state.hero.maxShield}`;

      // 3. Stats Box
      const adEl = document.getElementById('lol-stat-ad');
      if (adEl) adEl.textContent = Math.round(state.hero.attackDamage);
      const armorEl = document.getElementById('lol-stat-armor');
      if (armorEl) armorEl.textContent = Math.round(state.hero.maxShield);
      const asEl = document.getElementById('lol-stat-as');
      if (asEl) asEl.textContent = state.hero.attackSpeed.toFixed(1);
      const msEl = document.getElementById('lol-stat-ms');
      if (msEl) msEl.textContent = Math.round(state.hero.moveSpeed * 38);
      const critEl = document.getElementById('lol-stat-crit');
      if (critEl) critEl.textContent = `${Math.round(state.hero.critChance * 100)}%`;

      // 4. Cooldown Overlays on abilities
      const cdW = document.getElementById('lol-cd-w');
      if (cdW) {
        if (state.hero.dashTimer > 0) {
          cdW.style.display = 'flex';
          cdW.textContent = `${state.hero.dashTimer.toFixed(1)}s`;
        } else {
          cdW.style.display = 'none';
        }
      }

      const cdE = document.getElementById('lol-cd-e');
      const slotE = document.getElementById('btn-lol-e');
      if (cdE && slotE) {
        const pct = (state.hero.specialCharge / state.hero.specialMaxCharge) * 100;
        if (state.hero.specialCharge >= state.hero.specialMaxCharge) {
          cdE.style.display = 'none';
          slotE.classList.add('ready');
        } else {
          cdE.style.display = 'flex';
          cdE.textContent = `${Math.round(pct)}%`;
          slotE.classList.remove('ready');
        }
      }

      const cdR = document.getElementById('lol-cd-r');
      const slotR = document.getElementById('btn-lol-r');
      if (cdR && slotR) {
        if (state.hero.ultimateCooldown && state.hero.ultimateCooldown > 0) {
          cdR.style.display = 'flex';
          cdR.textContent = `${Math.ceil(state.hero.ultimateCooldown)}s`;
          slotR.classList.remove('ready');
        } else {
          cdR.style.display = 'none';
          slotR.classList.add('ready');
        }
      }

      // Auto attack toggle highlight
      const slotF = document.getElementById('btn-lol-f');
      if (slotF) {
        if (state.hero.autoAttack) slotF.classList.add('ready');
        else slotF.classList.remove('ready');
      }

      // 5. Gear items in slots 1-4
      if (state.gear) {
        const item1 = document.getElementById('lol-item-icon-1');
        if (item1 && state.gear.weapon) item1.textContent = state.gear.weapon.icon;
        const item2 = document.getElementById('lol-item-icon-2');
        if (item2 && state.gear.armor) item2.textContent = state.gear.armor.icon;
        const item3 = document.getElementById('lol-item-icon-3');
        if (item3 && state.gear.boots) item3.textContent = state.gear.boots.icon;
        const item4 = document.getElementById('lol-item-icon-4');
        if (item4 && state.gear.relic) item4.textContent = state.gear.relic.icon;
      }

      // 6. Gold & Minerals
      const gold = (state.materials.pyrite * 25) + (state.materials.aether * 35) + (state.materials.titanium * 50) + (state.materials.catalyst * 100);
      const goldCount = document.getElementById('lol-gold-count');
      if (goldCount) goldCount.textContent = gold;
      const minP = document.getElementById('lol-min-pyrite');
      if (minP) minP.textContent = `🔥 ${state.materials.pyrite}`;
      const minA = document.getElementById('lol-min-aether');
      if (minA) minA.textContent = `💧 ${state.materials.aether}`;
      const minT = document.getElementById('lol-min-titanium');
      if (minT) minT.textContent = `🛡️ ${state.materials.titanium}`;
      const minC = document.getElementById('lol-min-catalyst');
      if (minC) minC.textContent = `✨ ${state.materials.catalyst}`;

      // 7. Top Scoreboard
      const scoreKills = document.getElementById('lol-score-kills');
      if (scoreKills) scoreKills.textContent = state.kills;
      const liveEnemies = enemies.filter(e => !e.dead).length;
      const scoreEnemies = document.getElementById('lol-score-enemies');
      if (scoreEnemies) scoreEnemies.textContent = liveEnemies;
      const threatsBadge = document.getElementById('lol-threats-badge');
      if (threatsBadge) threatsBadge.textContent = `THREATS: ${liveEnemies}`;
      const csCount = document.getElementById('lol-cs-count');
      if (csCount) csCount.textContent = `${state.kills + state.gearRefinedCount * 4} CS`;

      // Timer mm:ss
      const mins = Math.floor(state.runTimer / 60);
      const secs = Math.floor(state.runTimer % 60);
      const timerEl = document.getElementById('lol-game-timer');
      if (timerEl) timerEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

      // Wave title & progress
      const waveTitle = document.getElementById('lol-wave-title');
      if (waveTitle) waveTitle.textContent = `WAVE ${state.currentWave} / 5`;
      const waveProgress = document.getElementById('lol-wave-progress-fill');
      if (waveProgress) {
        const pct = Math.max(0, Math.min(100, (state.waveTimeRemaining / GAME_CONFIG.WAVE_DURATION) * 100));
        waveProgress.style.width = pct + '%';
      }

      // 8. Epic Boss Bar
      const boss = enemies.find(e => e.type === 'boss' && !e.dead);
      const bossContainer = document.getElementById('lol-boss-bar-container');
      if (boss && bossContainer) {
        bossContainer.style.display = 'flex';
        const bossFill = document.getElementById('lol-boss-fill');
        const bossPct = Math.max(0, Math.min(100, (boss.hp / boss.maxHp) * 100));
        if (bossFill) bossFill.style.width = bossPct + '%';
        const bossPctText = document.getElementById('lol-boss-pct');
        if (bossPctText) bossPctText.textContent = Math.round(bossPct) + '%';
      } else if (bossContainer) {
        bossContainer.style.display = 'none';
      }

      // 9. Allies Sidebar
      const alliesHud = document.getElementById('lol-allies-hud');
      if (alliesHud && state.gameMode === 'multiplayer' && remoteHeroes.size > 0) {
        alliesHud.style.display = 'flex';
        alliesHud.innerHTML = '';
        remoteHeroes.forEach((rh, peerId) => {
          const allyCard = document.createElement('div');
          allyCard.className = 'lol-ally-card';
          const aPct = Math.max(0, Math.min(100, (rh.hp / rh.maxHp) * 100));
          allyCard.innerHTML = `
            <div class="lol-ally-avatar">${rh.classData ? rh.classData.icon : '🛡️'}</div>
            <div class="lol-ally-col">
              <span class="lol-ally-name">${rh.username || 'ALLY'}</span>
              <div class="lol-ally-bar-wrap">
                <div class="lol-ally-hp-fill" style="width: ${aPct}%; background: ${rh.isDowned ? '#ff0054' : '#15a05c'};"></div>
              </div>
            </div>
            <div class="lol-ally-ult-gem ${rh.isDowned ? 'charging' : ''}" title="Ultimate Status"></div>
          `;
          alliesHud.appendChild(allyCard);
        });
      } else if (alliesHud) {
        alliesHud.style.display = 'none';
      }
    }

    function startMatchWithLoadingScreen(onComplete) {
      sound.init();
      const startModal = document.getElementById('start-modal');
      const gameoverModal = document.getElementById('gameover-modal');
      const loadingScreen = document.getElementById('lol-loading-screen');

      if (startModal) startModal.style.display = 'none';
      if (gameoverModal) gameoverModal.style.display = 'none';
      if (loadingScreen) loadingScreen.style.display = 'none'; // Skip loading screen entirely

      // Immediately show HUD and enter game
      state.isExitPaused = false;
      const lolTop = document.getElementById('lol-top-hud');
      if (lolTop) lolTop.style.display = 'flex';
      const lolBottom = document.getElementById('lol-bottom-console');
      if (lolBottom) lolBottom.style.display = 'flex';
      const lolMinimap = document.getElementById('lol-minimap-container');
      if (lolMinimap) lolMinimap.style.display = 'block';
      if (state.platform === 'mobile' || isMobileDevice() || window.innerWidth <= 950 || window.innerHeight <= 520) {
        document.querySelectorAll('.mobile-controls').forEach(el => el.style.display = 'block');
      }

      // Execute game reset callback — the 3-second countdown overlay is triggered inside startWave()
      if (onComplete) onComplete();
    }

    initLolMinimap();

export { initLolMinimap, drawMinimap, updateLolHUD, startMatchWithLoadingScreen };
window.initLolMinimap = initLolMinimap;
window.drawMinimap = drawMinimap;
window.updateLolHUD = updateLolHUD;
window.startMatchWithLoadingScreen = startMatchWithLoadingScreen;

