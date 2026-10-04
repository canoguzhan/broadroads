/* Wave Manager & 3-Second Arena Preparation Countdown */
    let waveSpawnTimer = 0;
    let lastCountdownBeep = -1;

    function showArenaCountdown() {
      state.spawnDelayCountdown = 3.0;
      lastCountdownBeep = -1;
      const overlay = document.getElementById('arena-countdown-overlay');
      if (overlay) {
        overlay.style.display = 'flex';
        overlay.classList.remove('fade-out');
      }
      updateCountdownOverlay(3.0);
    }

    function updateCountdownOverlay(remaining) {
      const overlay = document.getElementById('arena-countdown-overlay');
      const digitEl = document.getElementById('countdown-digit');
      const statusEl = document.getElementById('countdown-status');
      if (!overlay || !digitEl) return;

      if (remaining > 0) {
        const sec = Math.ceil(remaining);
        if (sec !== lastCountdownBeep) {
          lastCountdownBeep = sec;
          sound.playCountdownBeep(false);
          digitEl.textContent = sec;
          digitEl.style.animation = 'none';
          void digitEl.offsetWidth;
          digitEl.style.animation = 'countdownPulse 0.8s ease-out';
          if (statusEl) statusEl.textContent = `THREATS SPAWNING IN ${sec} SECOND${sec > 1 ? 'S' : ''}...`;
        }
      } else {
        if (lastCountdownBeep !== 0) {
          lastCountdownBeep = 0;
          sound.playCountdownBeep(true);
          digitEl.textContent = '⚔️ FIGHT!';
          digitEl.style.fontSize = '44px';
          digitEl.style.color = '#00f0ff';
          if (statusEl) statusEl.textContent = 'ARENA BATTLE COMMENCED!';
          setTimeout(() => {
            overlay.classList.add('fade-out');
            setTimeout(() => {
              overlay.style.display = 'none';
              digitEl.style.fontSize = '';
              digitEl.style.color = '';
            }, 350);
          }, 550);
        }
      }
    }

    function startWave(waveNumber) {
      state.phase = 'playing';
      if (state.soloSubMode === 'dungeon') {
        state.currentWave = state.dungeonFloor || 1;
        waveNumber = state.dungeonFloor || 1;
      } else {
        state.currentWave = waveNumber;
      }
      state.waveTimeRemaining = (state.soloSubMode === 'dungeon') ? 35 : GAME_CONFIG.WAVE_DURATION;
      waveSpawnTimer = 0;
      state.bossSpawnedThisWave = false;

      document.getElementById('refinery-modal').style.display = 'none';
      document.getElementById('start-modal').style.display = 'none';
      document.getElementById('revive-banner').style.display = 'none';
      const clearModal = document.getElementById('dungeon-clear-modal');
      if (clearModal) clearModal.style.display = 'none';
      const lvlModal = document.getElementById('dungeon-levelup-modal');
      if (lvlModal) lvlModal.style.display = 'none';
      const ascModal = document.getElementById('ascension-modal');
      if (ascModal) ascModal.style.display = 'none';

      if (state.soloSubMode === 'dungeon') {
        document.getElementById('wave-display-title').textContent = `DUNGEON: F-${state.dungeonFloor} / 1000`;
        document.getElementById('hud-mode-badge').textContent = `LEVEL ${state.dungeonLevel} / 100 • ${state.heroClass.toUpperCase()}`;
      } else {
        const modeTitle = state.gameMode === 'multiplayer' ? 'CO-OP' : (state.soloSubMode === 'endless' ? 'ENDLESS' : 'CLASSIC');
        document.getElementById('wave-display-title').textContent = `WAVE ${waveNumber} ${state.soloSubMode === 'endless' ? '' : '/ 5'}`;
        document.getElementById('hud-mode-badge').textContent = `${modeTitle.toUpperCase()} • ${state.heroClass.toUpperCase()}`;
      }

      // Check Boss Spawn: Every 10 floors in Dungeon Mode, or Wave 5 in other modes
      const isBossFloor = (state.soloSubMode === 'dungeon' && waveNumber % 10 === 0) || (state.soloSubMode !== 'dungeon' && waveNumber % 5 === 0);
      if (isBossFloor) {
        document.getElementById('boss-hud').style.display = 'block';
        const bossNameEl = document.getElementById('boss-display-name');
        const lolBossNameEl = document.getElementById('lol-boss-name');
        let bTitle = 'IGNIS REX - ANVIL OVERLORD';
        if (state.soloSubMode === 'dungeon') {
          const bossTitles = {
            10: 'ABYSSAL WARDEN',
            20: 'OBSIDIAN GOLEM',
            30: 'INFERNAL OVERLORD',
            40: 'VOID REAPER',
            50: 'CELESTIAL TITAN',
            60: 'NIGHTSHADE DRAKE',
            70: 'ASTRAL ARCHON',
            80: 'CHRONOS CRUCIBLE',
            90: 'ANVIL DEMIURGE',
            100: 'ETERNAL VOID ARCHON'
          };
          bTitle = bossTitles[waveNumber] || `FLOOR ${waveNumber} CRUCIBLE GUARDIAN`;
        }
        if (bossNameEl) bossNameEl.textContent = bTitle;
        if (lolBossNameEl) lolBossNameEl.textContent = bTitle;
      } else {
        document.getElementById('boss-hud').style.display = 'none';
      }

      sound.playFanfare();
      // START 3-SECOND TIMER BEFORE MOB SPAWNING
      showArenaCountdown();
    }

    function updateWaveSpawning(dt) {
      if (state.phase !== 'playing') return;

      // 3-SECOND TIMER BEFORE MOB SPAWNING / ARENA COMBAT
      if (state.spawnDelayCountdown > 0) {
        state.spawnDelayCountdown -= dt;
        updateCountdownOverlay(state.spawnDelayCountdown);
        const cdDigit = Math.max(1, Math.ceil(state.spawnDelayCountdown));
        const aliveEl = document.getElementById('enemies-alive-text');
        if (aliveEl) aliveEl.textContent = `BATTLE IN ${cdDigit}s...`;
        return; // Hold mob spawning and wave time drain during 3s prep!
      }

      // In 5v5 PvP mode, autonomous AI bots handle combat; do not spawn PvE wave mobs
      if (state.gameMode === 'pvp') return;

      // Spawn boss once countdown ends if boss floor
      const isBossFloor = (state.soloSubMode === 'dungeon' && state.currentWave % 10 === 0) || (state.soloSubMode !== 'dungeon' && state.currentWave % 5 === 0);
      if (isBossFloor && !state.bossSpawnedThisWave) {
        state.bossSpawnedThisWave = true;
        spawnEnemy('boss');
      }

      state.waveTimeRemaining -= dt;
      state.runTimer += dt;

      if (state.hero.specialCharge < state.hero.specialMaxCharge) {
        state.hero.specialCharge = Math.min(state.hero.specialMaxCharge, state.hero.specialCharge + dt * 3.5);
        updateSpecialButton();
      }

      const mins = Math.floor(Math.max(0, state.waveTimeRemaining) / 60);
      const secs = Math.floor(Math.max(0, state.waveTimeRemaining) % 60);
      document.getElementById('wave-timer').textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

      const aliveCount = enemies.filter(e => !e.dead).length;
      document.getElementById('enemies-alive-text').textContent = `THREATS: ${aliveCount}`;

      waveSpawnTimer -= dt;
      if (waveSpawnTimer <= 0 && state.waveTimeRemaining > 2) {
        const interval = Math.max(0.6, 2.5 - Math.min(10, state.currentWave) * 0.2);
        waveSpawnTimer = interval;

        if (state.currentWave === 1) {
          spawnEnemy('crawler');
        } else if (state.currentWave === 2) {
          spawnEnemy(Math.random() > 0.4 ? 'crawler' : 'brute');
        } else if (state.currentWave === 3) {
          spawnEnemy(Math.random() > 0.5 ? 'caster' : 'crawler');
        } else {
          const r = Math.random();
          if (r < 0.4) spawnEnemy('crawler');
          else if (r < 0.75) spawnEnemy('brute');
          else spawnEnemy('caster');
        }
      }

      if (state.waveTimeRemaining <= 0 || (isBossFloor && enemies.some(e => e.type === 'boss' && e.dead))) {
        completeWave();
      }
    }

    function completeWave() {
      if (state.phase !== 'playing') return;
      state.phase = 'wave_cleared';
      enemies.forEach(e => { if (!e.dead && e.type !== 'boss') e.die(); });

      if (state.soloSubMode === 'dungeon') {
        state.phase = 'dungeon_clear';
        state.waveTimeRemaining = 999;
        state.totalDungeonsCleared++;
        state.maxFloorReached = Math.max(state.maxFloorReached, state.dungeonFloor);
        const oldLvl = state.dungeonLevel;
        state.dungeonLevel = Math.min(100, Math.floor(state.totalDungeonsCleared / 10) + 1);

        authManager.saveProgress();

        if (state.dungeonFloor >= 1000) {
          sound.playVictory();
          const ascModal = document.getElementById('ascension-modal');
          if (ascModal) ascModal.style.display = 'flex';
          showLolBanner('1,000 DUNGEONS CONQUERED!', 'FULL GAME POTENTIAL UNLOCKED');
          return;
        }

        if (state.dungeonLevel > oldLvl) {
          sound.playVictory();
          const lvlModal = document.getElementById('dungeon-levelup-modal');
          const lvlTitle = document.getElementById('levelup-title');
          const lvlNext = document.getElementById('levelup-next-note');
          if (lvlTitle) lvlTitle.textContent = `LEVEL UP: REACHED LEVEL ${state.dungeonLevel}!`;
          if (lvlNext) {
            const rem = 10 - (state.totalDungeonsCleared % 10);
            lvlNext.textContent = state.dungeonLevel >= 100 ? 'MAXIMUM LEVEL CAP REACHED (LV.100)!' : `Complete ${rem} more dungeons to reach Level ${state.dungeonLevel + 1}!`;
          }
          // Permanent Stat Boosts
          state.hero.maxHp += 15;
          state.hero.hp = state.hero.maxHp;
          state.hero.attackDamage += 3;
          state.hero.maxShield += 10;
          state.hero.shield = state.hero.maxShield;

          if (lvlModal) lvlModal.style.display = 'flex';
          showLolBanner(`LEVEL UP! REACHED LEVEL ${state.dungeonLevel}`, '+15 HP • +3 ATK • +10 SHIELD');
          return;
        }

        // Normal Floor Clear Modal
        sound.playFanfare();
        const clearModal = document.getElementById('dungeon-clear-modal');
        const clearTitle = document.getElementById('dungeon-clear-title');
        const clearFloor = document.getElementById('dungeon-modal-floor');
        const clearLevel = document.getElementById('dungeon-modal-level');
        const clearNext = document.getElementById('dungeon-modal-next');
        if (clearTitle) clearTitle.textContent = `FLOOR ${state.dungeonFloor} CLEARED!`;
        if (clearFloor) clearFloor.textContent = `${state.dungeonFloor} / 1000`;
        if (clearLevel) clearLevel.textContent = `LEVEL ${state.dungeonLevel} / 100`;
        if (clearNext) {
          const rem = 10 - (state.totalDungeonsCleared % 10);
          clearNext.textContent = state.dungeonLevel >= 100 ? 'MAX LEVEL CAP' : `${rem} FLOORS TO LV.${state.dungeonLevel + 1}`;
        }
        if (clearModal) clearModal.style.display = 'flex';
        showLolBanner(`FLOOR ${state.dungeonFloor} CLEARED!`, 'WIPE OUT! ALL ENEMIES ELIMINATED');
        return;
      }

      if (state.soloSubMode !== 'endless' && state.currentWave >= GAME_CONFIG.TOTAL_WAVES) {
        handleGameOver(true);
      } else {
        openRefinery();
      }
    }


export {
  waveSpawnTimer, showArenaCountdown, updateCountdownOverlay,
  startWave, updateWaveSpawning, completeWave
};
window.waveSpawnTimer = waveSpawnTimer;
window.showArenaCountdown = showArenaCountdown;
window.updateCountdownOverlay = updateCountdownOverlay;
window.startWave = startWave;
window.updateWaveSpawning = updateWaveSpawning;
window.completeWave = completeWave;

