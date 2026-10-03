/* The Gear Refinery & Crucible Synthesizer */
    function openRefinery() {
      state.phase = 'refinery';
      state.refineryTimeRemaining = GAME_CONFIG.REFINERY_DURATION;
      sound.playFanfare();

      state.crucible.slot1 = null;
      state.crucible.slot2 = null;
      updateCrucibleUI();

      document.getElementById('refinery-modal').style.display = 'flex';
      updateInventoryHUD();
      updateGearLoadoutUI();
    }

    function updateRefineryTimer(dt) {
      if (state.phase !== 'refinery') return;

      state.refineryTimeRemaining -= dt;
      const secs = Math.ceil(Math.max(0, state.refineryTimeRemaining));
      document.getElementById('refinery-countdown').textContent = `NEXT WAVE: ${secs}s`;

      if (state.refineryTimeRemaining <= 0) {
        startWave(state.currentWave + 1);
      }
    }

    function insertMaterialToCrucible(matType) {
      if (state.materials[matType] <= 0) return;

      if (!state.crucible.slot1) {
        state.crucible.slot1 = matType;
        state.materials[matType]--;
      } else if (!state.crucible.slot2) {
        state.crucible.slot2 = matType;
        state.materials[matType]--;
      } else {
        state.materials[state.crucible.slot2]++;
        state.crucible.slot2 = matType;
        state.materials[matType]--;
      }

      sound.playPickup();
      updateInventoryHUD();
      updateCrucibleUI();
    }

    function clearCrucibleSlot(slotNum) {
      if (slotNum === 1 && state.crucible.slot1) {
        state.materials[state.crucible.slot1]++;
        state.crucible.slot1 = null;
      } else if (slotNum === 2 && state.crucible.slot2) {
        state.materials[state.crucible.slot2]++;
        state.crucible.slot2 = null;
      }
      updateInventoryHUD();
      updateCrucibleUI();
    }

    function updateCrucibleUI() {
      const s1 = state.crucible.slot1;
      const s2 = state.crucible.slot2;

      const slot1El = document.getElementById('forge-slot-1');
      if (s1) {
        slot1El.classList.add('filled');
        const meta = MAT_TYPES.find(m => m.id === s1);
        document.getElementById('slot-1-icon').textContent = meta ? meta.icon : '💎';
        document.getElementById('slot-1-name').textContent = s1.toUpperCase();
      } else {
        slot1El.classList.remove('filled');
        document.getElementById('slot-1-icon').textContent = '➕';
        document.getElementById('slot-1-name').textContent = 'SLOT A';
      }

      const slot2El = document.getElementById('forge-slot-2');
      if (s2) {
        slot2El.classList.add('filled');
        const meta = MAT_TYPES.find(m => m.id === s2);
        document.getElementById('slot-2-icon').textContent = meta ? meta.icon : '💎';
        document.getElementById('slot-2-name').textContent = s2.toUpperCase();
      } else {
        slot2El.classList.remove('filled');
        document.getElementById('slot-2-icon').textContent = '➕';
        document.getElementById('slot-2-name').textContent = 'SLOT B';
      }

      const btnForge = document.getElementById('btn-do-forge');
      if (s1 && s2) {
        const key = [s1, s2].sort().join('+');
        const recipe = RECIPES[key];
        state.crucible.predictedRecipe = recipe;

        if (recipe) {
          document.getElementById('preview-icon').textContent = recipe.icon;
          document.getElementById('preview-name').textContent = recipe.name;
          document.getElementById('preview-stats').textContent = recipe.statText;
          btnForge.disabled = false;
        } else {
          document.getElementById('preview-icon').textContent = '⚡';
          document.getElementById('preview-name').textContent = 'Runic Compound';
          document.getElementById('preview-stats').textContent = '+15 All Stats';
          btnForge.disabled = false;
        }
      } else {
        state.crucible.predictedRecipe = null;
        document.getElementById('preview-icon').textContent = '💎';
        document.getElementById('preview-name').textContent = 'Select Materials';
        document.getElementById('preview-stats').textContent = 'Insert 2 minerals into the crucible';
        btnForge.disabled = true;
      }
    }

    function executeForge() {
      if (!state.crucible.slot1 || !state.crucible.slot2) return;

      const recipe = state.crucible.predictedRecipe;
      sound.playAnvilStrike();
      triggerAnvilFlash();
      triggerScreenShake();
      state.gearRefinedCount++;

      if (recipe) {
        const currentTier = state.gear[recipe.slot].tier;
        const newTier = Math.min(5, currentTier + recipe.tierBonus);

        state.gear[recipe.slot] = {
          name: recipe.name,
          tier: newTier,
          icon: recipe.icon,
          stat: recipe.statText
        };

        if (recipe.slot === 'weapon') {
          state.hero.attackDamage += 20;
          state.hero.attackSpeed += 0.15;
          hero.updateVisualTier(newTier);
        } else if (recipe.slot === 'armor') {
          state.hero.maxHp += 90;
          state.hero.hp = Math.min(state.hero.maxHp, state.hero.hp + 90);
          state.hero.maxShield += 45;
          state.hero.shield = state.hero.maxShield;
        } else if (recipe.slot === 'boots') {
          state.hero.moveSpeed += 1.5;
          state.hero.dashCooldown = Math.max(0.6, state.hero.dashCooldown - 0.15);
        } else if (recipe.slot === 'relic') {
          state.hero.critChance = Math.min(0.7, state.hero.critChance + 0.12);
          state.hero.critMult += 0.35;
        }
      } else {
        state.hero.attackDamage += 12;
        state.hero.maxHp += 50;
        state.hero.hp += 50;
      }

      state.crucible.slot1 = null;
      state.crucible.slot2 = null;

      updateCrucibleUI();
      updateGearLoadoutUI();
      updateVitalsHUD();
    }

    function executeAutoForge() {
      const available = [];
      ['pyrite', 'aether', 'titanium', 'catalyst'].forEach(k => {
        for (let i = 0; i < state.materials[k]; i++) available.push(k);
      });

      if (available.length < 2) {
        sound.playHit();
        return;
      }

      insertMaterialToCrucible(available[0]);
      insertMaterialToCrucible(available[1]);
      setTimeout(() => executeForge(), 200);
    }

    function updateInventoryHUD() {
      document.getElementById('hud-pyrite').textContent = state.materials.pyrite;
      document.getElementById('hud-aether').textContent = state.materials.aether;
      document.getElementById('hud-titanium').textContent = state.materials.titanium;
      document.getElementById('hud-catalyst').textContent = state.materials.catalyst;

      document.getElementById('bag-pyrite-count').textContent = state.materials.pyrite;
      document.getElementById('bag-aether-count').textContent = state.materials.aether;
      document.getElementById('bag-titanium-count').textContent = state.materials.titanium;
      document.getElementById('bag-catalyst-count').textContent = state.materials.catalyst;
    }

    function updateGearLoadoutUI() {
      const tierNames = ['', 'T1 Common', 'T2 Rare', 'T3 Epic', 'T4 Legendary', 'T5 Mythic'];

      ['weapon', 'armor', 'boots', 'relic'].forEach(slot => {
        const item = state.gear[slot];
        const cardEl = document.getElementById(`gear-card-${slot}`);
        cardEl.className = `gear-card tier-${item.tier}`;
        document.getElementById(`gear-name-${slot}`).textContent = item.name;
        document.getElementById(`gear-tier-${slot}`).textContent = tierNames[item.tier] || 'T1 Common';
        document.getElementById(`gear-stat-${slot}`).textContent = item.stat;
      });

      const avgTier = Math.round((state.gear.weapon.tier + state.gear.armor.tier + state.gear.boots.tier + state.gear.relic.tier) / 4);
      document.getElementById('hero-tier-tag').textContent = tierNames[avgTier] || 'TIER I';
    }

    function updateVitalsHUD() {
      const nameEl = document.getElementById('local-hero-name');
      if (nameEl) {
        nameEl.textContent = (state.username || 'COMMANDER').toUpperCase();
      }
      const hpPct = Math.max(0, Math.min(100, (state.hero.hp / state.hero.maxHp) * 100));
      document.getElementById('hp-bar').style.width = `${hpPct}%`;
      document.getElementById('hp-text').textContent = `${Math.ceil(state.hero.hp)}/${state.hero.maxHp}`;

      const shieldPct = Math.max(0, Math.min(100, (state.hero.shield / state.hero.maxShield) * 100));
      document.getElementById('shield-bar').style.width = `${shieldPct}%`;
      document.getElementById('shield-text').textContent = `${Math.ceil(state.hero.shield)}/${state.hero.maxShield}`;
    }

    function updateSpecialButton() {
      const btn = document.getElementById('btn-special');
      const lbl = document.getElementById('special-lbl');
      const overlay = document.getElementById('special-cooldown');
      const pct = (state.hero.specialCharge / state.hero.specialMaxCharge) * 100;

      const specialNames = { paladin: 'NOVA', gunner: 'BARRAGE', arcanist: 'VORTEX' };
      const sName = specialNames[state.heroClass] || 'NOVA';

      if (state.hero.specialCharge >= state.hero.specialMaxCharge) {
        btn.classList.add('ready');
        lbl.textContent = sName;
        overlay.style.display = 'none';
      } else {
        btn.classList.remove('ready');
        lbl.textContent = `${Math.round(pct)}%`;
        overlay.style.display = 'flex';
        overlay.textContent = `${Math.round(pct)}%`;
      }
    }

    function updateCooldownOverlays() {
      const dashOverlay = document.getElementById('dash-cooldown');
      if (state.hero.dashTimer > 0.05) {
        dashOverlay.style.display = 'flex';
        dashOverlay.textContent = `${state.hero.dashTimer.toFixed(1)}s`;
      } else {
        dashOverlay.style.display = 'none';
      }

      const ultOverlay = document.getElementById('mobile-ult-cooldown');
      const ultBtn = document.getElementById('btn-mobile-ultimate');
      if (ultOverlay && ultBtn) {
        if (state.hero.ultimateCooldown && state.hero.ultimateCooldown > 0) {
          ultOverlay.style.display = 'flex';
          ultOverlay.textContent = `${Math.ceil(state.hero.ultimateCooldown)}s`;
          ultBtn.classList.remove('ready');
        } else {
          ultOverlay.style.display = 'none';
          ultBtn.classList.add('ready');
        }
      }
    }

export {
  openRefinery, updateRefineryTimer, insertMaterialToCrucible,
  clearCrucibleSlot, updateCrucibleUI, executeForge, executeAutoForge,
  updateInventoryHUD, updateGearLoadoutUI, updateVitalsHUD,
  updateSpecialButton, updateCooldownOverlays
};
window.openRefinery = openRefinery;
window.updateRefineryTimer = updateRefineryTimer;
window.insertMaterialToCrucible = insertMaterialToCrucible;
window.clearCrucibleSlot = clearCrucibleSlot;
window.updateCrucibleUI = updateCrucibleUI;
window.executeForge = executeForge;
window.executeAutoForge = executeAutoForge;
window.updateInventoryHUD = updateInventoryHUD;
window.updateGearLoadoutUI = updateGearLoadoutUI;
window.updateVitalsHUD = updateVitalsHUD;
window.updateSpecialButton = updateSpecialButton;
window.updateCooldownOverlays = updateCooldownOverlays;

