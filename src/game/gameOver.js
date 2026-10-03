/* Game Over, Victory & Match Reset Handlers */
    function handleGameOver(isVictory) {
      state.phase = isVictory ? 'victory' : 'gameover';

      if (isVictory) sound.playFanfare();
      else sound.playHit();

      const modal = document.getElementById('gameover-modal');
      const box = document.getElementById('end-card-box');
      const title = document.getElementById('end-title');
      const subtitle = document.getElementById('end-subtitle');

      if (isVictory) {
        box.classList.add('victory-card');
        title.className = 'end-title victory';
        title.textContent = 'ARENA CONQUERED!';
        subtitle.textContent = 'You forged mythic gear and vanquished the Astral Overlord!';
        showLolBanner('VICTORY', 'ARENA CONQUERED');
      } else {
        box.classList.remove('victory-card');
        title.className = 'end-title defeat';
        title.textContent = 'ARENA FALLEN';
        subtitle.textContent = 'The void horrors shattered your defenses.';
        showLolBanner('DEFEAT', 'DEFENSES SHATTERED');
      }

      document.getElementById('stat-mode').textContent = `${state.gameMode.toUpperCase()} (${state.soloSubMode})`;
      document.getElementById('stat-waves-cleared').textContent = `${isVictory ? 5 : state.currentWave - 1} ${state.soloSubMode === 'endless' ? 'Waves' : '/ 5'}`;
      document.getElementById('stat-kills').textContent = state.kills;
      document.getElementById('stat-refined').textContent = state.gearRefinedCount;
      document.getElementById('stat-damage').textContent = Math.round(state.totalDamageDealt);

      const mins = Math.floor(state.runTimer / 60);
      const secs = Math.floor(state.runTimer % 60);
      document.getElementById('stat-time').textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

      modal.style.display = 'flex';
    }

    function resetGame() {
      document.getElementById('gameover-modal').style.display = 'none';
      document.getElementById('start-modal').style.display = 'none';
      document.getElementById('boss-hud').style.display = 'none';

      enemies.forEach(e => e.destroy());
      enemies.length = 0;
      droppedMaterials.forEach(d => scene.remove(d.mesh));
      droppedMaterials.length = 0;
      projectiles.forEach(p => scene.remove(p.mesh));
      projectiles.length = 0;
      slashWaves.forEach(w => scene.remove(w.mesh));
      slashWaves.length = 0;
      shockwaves.forEach(s => scene.remove(s.mesh));
      shockwaves.length = 0;
      gunnerRockets.forEach(r => scene.remove(r.mesh));
      gunnerRockets.length = 0;
      blackHoles.forEach(b => scene.remove(b.mesh));
      blackHoles.length = 0;

      state.currentWave = 1;
      state.runTimer = 0;
      state.kills = 0;
      state.totalDamageDealt = 0;
      state.gearRefinedCount = 0;

      state.materials = { pyrite: 2, aether: 2, titanium: 2, catalyst: 1 };

      // Base class stat modifiers based on classType (melee, ranged, magic)
      const classType = (state.activeClassData && state.activeClassData.type) ||
        (state.heroClass === 'gunner' ? 'ranged' : (state.heroClass === 'arcanist' ? 'magic' : 'melee'));

      if (classType === 'melee') {
        state.hero.maxHp = 140;
        state.hero.maxShield = 70;
        state.hero.moveSpeed = 8.5;
        state.hero.attackDamage = 32;
        state.hero.critChance = 0.15;
      } else if (classType === 'ranged') {
        state.hero.maxHp = 100;
        state.hero.maxShield = 50;
        state.hero.moveSpeed = 10.0;
        state.hero.attackDamage = 26;
        state.hero.critChance = 0.20;
      } else if (classType === 'magic') {
        state.hero.maxHp = 110;
        state.hero.maxShield = 80;
        state.hero.moveSpeed = 8.2;
        state.hero.attackDamage = 34;
        state.hero.critChance = 0.28;
      }

      if (state.soloSubMode === 'dungeon') {
        state.currentWave = state.dungeonFloor || 1;
        const currentLvl = Math.min(100, Math.max(1, state.dungeonLevel || Math.floor((state.totalDungeonsCleared || 0) / 10) + 1));
        state.dungeonLevel = currentLvl;
        const bonusHp = (currentLvl - 1) * 15;
        const bonusDmg = (currentLvl - 1) * 3;
        const bonusShield = (currentLvl - 1) * 10;
        state.hero.maxHp += bonusHp;
        state.hero.attackDamage += bonusDmg;
        state.hero.maxShield += bonusShield;
      }

      state.hero.hp = state.hero.maxHp;
      state.hero.shield = state.hero.maxShield;
      state.hero.dashCooldown = 1.1;
      state.hero.specialCharge = 100;
      state.hero.ultimateCooldown = 0;
      state.hero.isDowned = false;

      hero.setClass(state.heroClass, state.activeClassData);
      if (hero.nameplate) {
        hero.nameplate.update(state.username, 1.0, false, net.isHost);
      }

      hero.position.set(state.gameMode === 'multiplayer' && !net.isHost ? (Math.random() > 0.5 ? 4 : -4) : 0, 0, 0);
      hero.updateVisualTier(1);

      // Update Action Icons based on class type
      const attackIcon = { melee: '⚔️', ranged: '🏹', magic: '🔮' };
      const specialIcon = { melee: '⚡', ranged: '🚀', magic: '🌌' };
      document.getElementById('attack-btn-icon').textContent = attackIcon[classType] || '⚔️';
      document.getElementById('special-btn-icon').textContent = specialIcon[classType] || '⚡';
      const lolSpellQ = document.getElementById('lol-spell-q');
      if (lolSpellQ) lolSpellQ.textContent = attackIcon[classType] || '⚔️';
      const lolSpellE = document.getElementById('lol-spell-e');
      if (lolSpellE) lolSpellE.textContent = specialIcon[classType] || '⚡';

      updateInventoryHUD();
      updateGearLoadoutUI();
      updateVitalsHUD();
      updateSpecialButton();
      updateLolHUD();

      startWave(1);
    }

export { handleGameOver, resetGame };
window.handleGameOver = handleGameOver;
window.resetGame = resetGame;

