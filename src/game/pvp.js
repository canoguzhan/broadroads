/* BROADROADS - 5v5 PvP Tactical Battleground Engine */
import { sound } from '../audio/sound.js';
import { state } from '../game/state.js';
import { showLolBanner, spawnFloatingCombatText, triggerScreenShake } from '../game/combat.js';
import { spawnExplosion, spawnGroundShockwave, spawnGunnerBolts, spawnArcanistSpark, spawnSlashWave } from '../game/weapons.js';
import { createNameplateSprite } from '../game/themeEngine.js';

class PvPEngine {
  constructor() {
    this.blueTeam = [];
    this.redTeam = [];
    this.pvpActive = false;
    this.scores = { blue: 0, red: 0, target: 15 };
    this.baseMeshes = [];
    this.botEntities = [];
    this.respawnTimer = 0;
  }

  initLobby() {
    this.scores = { blue: 0, red: 0, target: 15 };
    state.pvp.scores = this.scores;
    const playerTeam = state.pvp.playerTeam || 'blue';

    // Initialize 5 slots per team
    this.blueTeam = [];
    this.redTeam = [];

    // Local player in slot 0 of chosen team
    if (playerTeam === 'blue') {
      this.blueTeam.push({
        id: 'player',
        name: state.username,
        team: 'blue',
        isLocal: true,
        isBot: false,
        classId: state.heroClass || 'paladin',
        ready: true
      });
    } else {
      this.redTeam.push({
        id: 'player',
        name: state.username,
        team: 'red',
        isLocal: true,
        isBot: false,
        classId: state.heroClass || 'paladin',
        ready: true
      });
    }

    state.pvp.blueTeam = this.blueTeam;
    state.pvp.redTeam = this.redTeam;
    this.renderPvPLobbyUI();
  }

  setPlayerSide(team) {
    if (team !== 'blue' && team !== 'red') return;
    state.pvp.playerTeam = team;
    state.hero.team = team;
    sound.playPickup();
    this.initLobby();
  }

  fillWithAIBots() {
    sound.playFanfare();
    const botClasses = ['paladin', 'gunner', 'arcanist'];
    const blueBotNames = ['Aegis_Bot', 'Vanguard_AI', 'Cryo_Striker', 'Frost_Archon', 'Glacial_Knight'];
    const redBotNames = ['Inferno_Bot', 'Pyre_Striker', 'Magma_Cleaver', 'Hellfire_Archon', 'Cursed_Reaper'];

    // Fill Blue to 5
    while (this.blueTeam.length < 5) {
      const idx = this.blueTeam.length;
      const cId = botClasses[idx % botClasses.length];
      this.blueTeam.push({
        id: `bot_blue_${idx}`,
        name: blueBotNames[idx] || `Blue_Unit_${idx}`,
        team: 'blue',
        isLocal: false,
        isBot: true,
        classId: cId,
        ready: true
      });
    }

    // Fill Red to 5
    while (this.redTeam.length < 5) {
      const idx = this.redTeam.length;
      const cId = botClasses[idx % botClasses.length];
      this.redTeam.push({
        id: `bot_red_${idx}`,
        name: redBotNames[idx] || `Red_Unit_${idx}`,
        team: 'red',
        isLocal: false,
        isBot: true,
        classId: cId,
        ready: true
      });
    }

    state.pvp.blueTeam = this.blueTeam;
    state.pvp.redTeam = this.redTeam;
    this.renderPvPLobbyUI();
  }

  addPlayerToTeam(username, team = 'blue') {
    const targetTeam = team === 'blue' ? this.blueTeam : this.redTeam;
    if (targetTeam.length >= 5) return false;
    targetTeam.push({
      id: 'player_' + username,
      name: username,
      team: team,
      isLocal: false,
      isBot: false,
      classId: 'paladin',
      ready: true
    });
    this.renderPvPLobbyUI();
    return true;
  }

  renderPvPLobbyUI() {
    const blueList = document.getElementById('pvp-blue-slots');
    const redList = document.getElementById('pvp-red-slots');
    const btnJoinBlue = document.getElementById('btn-pvp-join-blue');
    const btnJoinRed = document.getElementById('btn-pvp-join-red');

    if (btnJoinBlue && btnJoinRed) {
      if (state.pvp.playerTeam === 'blue') {
        btnJoinBlue.classList.add('active');
        btnJoinRed.classList.remove('active');
      } else {
        btnJoinRed.classList.add('active');
        btnJoinBlue.classList.remove('active');
      }
    }

    const renderSlots = (container, teamArray, teamColor) => {
      if (!container) return;
      container.innerHTML = '';
      for (let i = 0; i < 5; i++) {
        const slotEl = document.createElement('div');
        const p = teamArray[i];
        if (p) {
          slotEl.className = `pvp-slot-card filled team-${teamColor}`;
          const isMe = p.isLocal;
          const classIcons = { paladin: '🛡️', gunner: '🏹', arcanist: '🔮' };
          slotEl.innerHTML = `
            <div class="pvp-slot-avatar">${classIcons[p.classId] || '🛡️'}</div>
            <div class="pvp-slot-info">
              <span class="pvp-slot-name">${escapeHtml(p.name)} ${isMe ? '(YOU)' : (p.isBot ? '(BOT)' : '')}</span>
              <span class="pvp-slot-class">${(p.classId || 'PALADIN').toUpperCase()}</span>
            </div>
            <div class="pvp-slot-badge ready">READY</div>
          `;
        } else {
          slotEl.className = 'pvp-slot-card empty';
          slotEl.innerHTML = `
            <div class="pvp-slot-avatar">⏳</div>
            <div class="pvp-slot-info">
              <span class="pvp-slot-name">Empty Slot ${i + 1}</span>
              <span class="pvp-slot-class">Awaiting Player / Bot</span>
            </div>
            <button class="btn-slot-invite" data-team="${teamColor}" data-slot="${i}">+ INVITE</button>
          `;
          slotEl.querySelector('.btn-slot-invite').addEventListener('click', () => {
            if (window.clientNav) window.clientNav.toggleFriendsList(true);
          });
        }
        container.appendChild(slotEl);
      }
    };

    renderSlots(blueList, this.blueTeam, 'blue');
    renderSlots(redList, this.redTeam, 'red');
  }

  startPvPMatch() {
    this.pvpActive = true;
    state.gameMode = 'pvp';
    state.hero.team = state.pvp.playerTeam || 'blue';
    this.scores = { blue: 0, red: 0, target: 15 };
    state.pvp.scores = this.scores;

    // Enforce 5 players per team with auto-fill if user started with open slots
    this.fillWithAIBots();

    // Setup larger battlefield
    this.setupPvPArena();

    // Spawn 3D AI Entities for Bots
    this.spawnPvPBots();

    // Position local hero at their team fountain
    if (window.hero) {
      const spawnX = state.hero.team === 'blue' ? -27 : 27;
      window.hero.position.set(spawnX, 0, 0);
      window.hero.targetPos.set(spawnX, 0, 0);
      state.hero.hp = state.hero.maxHp;
      state.hero.shield = state.hero.maxShield;
      state.hero.isDowned = false;
      state.hero.invincibleTimer = 3.0; // 3s spawn invincibility
    }

    // Show PvP scoreboard overlay
    const pvpScoreOverlay = document.getElementById('pvp-scoreboard-overlay');
    if (pvpScoreOverlay) pvpScoreOverlay.style.display = 'flex';
    this.updateScoreboardUI();

    // Minimap rule: SHOW MINIMAP ONLY FOR PVP
    const lolMinimap = document.getElementById('lol-minimap-container');
    if (lolMinimap) lolMinimap.style.display = 'block';

    showLolBanner('5v5 BATTLEGROUND COMMENCED!', `FIRST TEAM TO 15 KILLS WINS! (YOU ARE TEAM ${state.hero.team.toUpperCase()})`);
    sound.playFanfare();
  }

  setupPvPArena() {
    // Expand arena radius from 14 to 38
    if (window.arenaMesh) {
      window.arenaMesh.scale.set(2.6, 1, 2.6);
    }
    if (window.runeRing) {
      window.runeRing.scale.set(2.6, 2.6, 1);
    }
    if (window.outerRing) {
      window.outerRing.scale.set(2.6, 2.6, 1);
    }
    window.GAME_CONFIG.ARENA_RADIUS = 37.0;

    // Remove existing bases if any
    this.baseMeshes.forEach(m => window.scene.remove(m));
    this.baseMeshes = [];

    // Blue Base Fountain at (-27, 0, 0)
    const blueBaseGeo = new THREE.CylinderGeometry(5.5, 6.0, 0.4, 24);
    const blueBaseMat = new THREE.MeshStandardMaterial({
      color: 0x0044ff,
      emissive: 0x0088ff,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.85
    });
    const blueBase = new THREE.Mesh(blueBaseGeo, blueBaseMat);
    blueBase.position.set(-27, 0.05, 0);
    window.scene.add(blueBase);
    this.baseMeshes.push(blueBase);

    // Blue Base Crystal
    const blueCrystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.6),
      new THREE.MeshStandardMaterial({ color: 0x00f0ff, emissive: 0x00f0ff, emissiveIntensity: 0.9 })
    );
    blueCrystal.position.set(-27, 3.2, 0);
    window.scene.add(blueCrystal);
    this.baseMeshes.push(blueCrystal);

    // Red Base Fountain at (+27, 0, 0)
    const redBaseGeo = new THREE.CylinderGeometry(5.5, 6.0, 0.4, 24);
    const redBaseMat = new THREE.MeshStandardMaterial({
      color: 0x880022,
      emissive: 0xff0044,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.85
    });
    const redBase = new THREE.Mesh(redBaseGeo, redBaseMat);
    redBase.position.set(27, 0.05, 0);
    window.scene.add(redBase);
    this.baseMeshes.push(redBase);

    // Red Base Crystal
    const redCrystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.6),
      new THREE.MeshStandardMaterial({ color: 0xff0054, emissive: 0xff0054, emissiveIntensity: 0.9 })
    );
    redCrystal.position.set(27, 3.2, 0);
    window.scene.add(redCrystal);
    this.baseMeshes.push(redCrystal);
  }

  restoreStandardArena() {
    this.pvpActive = false;
    if (window.arenaMesh) window.arenaMesh.scale.set(1, 1, 1);
    if (window.runeRing) window.runeRing.scale.set(1, 1, 1);
    if (window.outerRing) window.outerRing.scale.set(1, 1, 1);
    window.GAME_CONFIG.ARENA_RADIUS = 14.0;

    this.baseMeshes.forEach(m => window.scene.remove(m));
    this.baseMeshes = [];

    this.botEntities.forEach(b => window.scene.remove(b.group));
    this.botEntities = [];

    const pvpScoreOverlay = document.getElementById('pvp-scoreboard-overlay');
    if (pvpScoreOverlay) pvpScoreOverlay.style.display = 'none';

    // Hide minimap in standard modes
    const lolMinimap = document.getElementById('lol-minimap-container');
    if (lolMinimap) lolMinimap.style.display = 'none';
  }

  spawnPvPBots() {
    // Clear existing bots
    this.botEntities.forEach(b => window.scene.remove(b.group));
    this.botEntities = [];

    const allMembers = [
      ...this.blueTeam.map(m => ({ ...m, team: 'blue' })),
      ...this.redTeam.map(m => ({ ...m, team: 'red' }))
    ];

    allMembers.forEach(member => {
      if (member.isLocal) return; // Local hero is already managed by HeroEntity

      const bot = new PvPAIBot(member);
      this.botEntities.push(bot);
      window.scene.add(bot.group);
    });
  }

  update(dt) {
    if (!this.pvpActive || state.phase !== 'playing') return;

    // Rotate base crystals
    if (this.baseMeshes.length >= 4) {
      this.baseMeshes[1].rotation.y += dt * 1.5;
      this.baseMeshes[3].rotation.y += dt * 1.5;
    }

    // Base healing fountain check for local player
    if (window.hero) {
      const myFountainX = state.hero.team === 'blue' ? -27 : 27;
      const dFountain = Math.hypot(window.hero.position.x - myFountainX, window.hero.position.z);
      if (dFountain < 5.5 && !state.hero.isDowned) {
        state.hero.hp = Math.min(state.hero.maxHp, state.hero.hp + dt * 35);
        state.hero.shield = Math.min(state.hero.maxShield, state.hero.shield + dt * 25);
        if (window.updateVitalsHUD) window.updateVitalsHUD();
      }
    }

    // Local Player Respawn countdown if downed
    if (state.hero.isDowned && this.respawnTimer > 0) {
      this.respawnTimer -= dt;
      const banner = document.getElementById('revive-banner');
      if (banner) {
        banner.style.display = 'block';
        banner.textContent = `⏳ RESPAWNING AT BASE IN ${Math.max(1, Math.ceil(this.respawnTimer))}s...`;
      }
      if (this.respawnTimer <= 0) {
        this.respawnLocalHero();
      }
    }

    // Update AI bots
    this.botEntities.forEach(bot => bot.update(dt, this));
  }

  handleEntityDeath(victim, killerName = 'Champion') {
    const victimTeam = victim.team;
    const scoringTeam = victimTeam === 'blue' ? 'red' : 'blue';

    this.scores[scoringTeam]++;
    state.pvp.scores = this.scores;
    this.updateScoreboardUI();

    sound.playNova();
    triggerScreenShake();

    const bannerColor = scoringTeam === 'blue' ? 'BLUE TEAM' : 'RED TEAM';
    showLolBanner(`${bannerColor} HAS SLAIN ${victim.name.toUpperCase()}!`, `SCORE: 🔵 ${this.scores.blue} - 🔴 ${this.scores.red}`);

    if (scoringTeam === state.hero.team) {
      state.pvp.stats.kills++;
      localStorage.setItem('broadroads_pvp_kills', state.pvp.stats.kills);
    }

    // Check Victory Condition (Target 15 kills)
    if (this.scores.blue >= this.scores.target || this.scores.red >= this.scores.target) {
      this.handleMatchEnd(this.scores.blue >= this.scores.target ? 'blue' : 'red');
      return;
    }

    // Trigger respawn
    if (victim.isLocal) {
      state.hero.isDowned = true;
      this.respawnTimer = 5.0;
    } else {
      victim.triggerRespawn(5.0);
    }
  }

  respawnLocalHero() {
    state.hero.isDowned = false;
    state.hero.hp = state.hero.maxHp;
    state.hero.shield = state.hero.maxShield;
    state.hero.invincibleTimer = 3.0; // 3s divine shield
    const spawnX = state.hero.team === 'blue' ? -27 : 27;
    window.hero.position.set(spawnX, 0, 0);
    window.hero.targetPos.set(spawnX, 0, 0);
    sound.playReviveChime();
    const banner = document.getElementById('revive-banner');
    if (banner) banner.style.display = 'none';
    if (window.updateVitalsHUD) window.updateVitalsHUD();
  }

  handleMatchEnd(winningTeam) {
    this.pvpActive = false;
    state.phase = 'gameover';

    const playerWon = state.hero.team === winningTeam;
    if (playerWon) {
      state.pvp.stats.wins++;
      localStorage.setItem('broadroads_pvp_wins', state.pvp.stats.wins);
      sound.playVictory();
      showLolBanner('VICTORY!', `YOUR TEAM CONQUERED THE 5v5 BATTLEGROUND!`);
    } else {
      state.pvp.stats.losses++;
      localStorage.setItem('broadroads_pvp_losses', state.pvp.stats.losses);
      sound.playDefeat();
      showLolBanner('DEFEAT!', `THE ENEMY TEAM CAPTURED 15 KILLS.`);
    }

    setTimeout(() => {
      this.restoreStandardArena();
      if (window.returnToLobby) window.returnToLobby();
    }, 4500);
  }

  updateScoreboardUI() {
    const blueScoreEl = document.getElementById('pvp-score-blue');
    const redScoreEl = document.getElementById('pvp-score-red');
    if (blueScoreEl) blueScoreEl.textContent = this.scores.blue;
    if (redScoreEl) redScoreEl.textContent = this.scores.red;
  }
}

/* PvPAIBot - Autonomous 5v5 Tactical Combat Entity */
class PvPAIBot {
  constructor(memberData) {
    this.name = memberData.name;
    this.team = memberData.team;
    this.classId = memberData.classId || 'paladin';
    this.group = new THREE.Group();
    this.position = this.group.position;

    this.maxHp = 130;
    this.hp = this.maxHp;
    this.attackDamage = 24;
    this.speed = 6.8;
    this.attackCooldown = 0;
    this.specialCooldown = 8.0;
    this.isDead = false;
    this.respawnTimer = 0;

    // Visual Mesh in Team Colors (Blue vs Red)
    const teamHex = this.team === 'blue' ? 0x0088ff : 0xff0044;
    const bodyMat = new THREE.MeshStandardMaterial({
      color: this.team === 'blue' ? 0x061e3e : 0x3d0b16,
      emissive: teamHex,
      emissiveIntensity: 0.5,
      metalness: 0.8
    });

    this.mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.45, 1.4, 8), bodyMat);
    this.mesh.position.y = 1.1;
    this.group.add(this.mesh);

    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 8), bodyMat);
    helm.position.y = 2.0;
    this.group.add(helm);

    const teamBeacon = new THREE.Mesh(
      new THREE.ConeGeometry(0.25, 0.5, 4),
      new THREE.MeshBasicMaterial({ color: teamHex })
    );
    teamBeacon.position.y = 2.6;
    teamBeacon.rotation.x = Math.PI;
    this.group.add(teamBeacon);

    // Nameplate with Team Color
    this.nameplate = createNameplateSprite(this.name, false, this.team === 'blue' ? '#00f0ff' : '#ff0054');
    this.group.add(this.nameplate.sprite);

    // Spawn at team fountain
    const spawnX = this.team === 'blue' ? -27 + (Math.random() - 0.5) * 4 : 27 + (Math.random() - 0.5) * 4;
    const spawnZ = (Math.random() - 0.5) * 6;
    this.position.set(spawnX, 0, spawnZ);
  }

  takeDamage(amount, isCrit, attacker = 'Hero') {
    if (this.isDead) return;
    this.hp -= amount;
    this.nameplate.update(this.name, Math.max(0, this.hp / this.maxHp), false, false);
    spawnFloatingCombatText(this.position.clone().add(new THREE.Vector3(0, 1.8, 0)), Math.round(amount), isCrit, this.team === 'blue' ? 0x00f0ff : 0xff0054, attacker);

    if (this.hp <= 0) {
      this.die(attacker);
    }
  }

  die(attacker) {
    this.isDead = true;
    this.group.visible = false;
    spawnExplosion(this.position, this.team === 'blue' ? 0x00bbf9 : 0xff0054);
    if (window.pvpEngine) {
      window.pvpEngine.handleEntityDeath(this, attacker);
    }
  }

  triggerRespawn(delay = 5.0) {
    this.respawnTimer = delay;
  }

  update(dt, pvpEngine) {
    if (this.isDead) {
      if (this.respawnTimer > 0) {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0) {
          this.isDead = false;
          this.hp = this.maxHp;
          this.nameplate.update(this.name, 1.0, false, false);
          const spawnX = this.team === 'blue' ? -27 + (Math.random() - 0.5) * 3 : 27 + (Math.random() - 0.5) * 3;
          this.position.set(spawnX, 0, (Math.random() - 0.5) * 4);
          this.group.visible = true;
          spawnExplosion(this.position, this.team === 'blue' ? 0x00f0ff : 0xff0054);
        }
      }
      return;
    }

    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.specialCooldown > 0) this.specialCooldown -= dt;

    // Find nearest opposing target (local hero or opposing bot)
    let nearestTarget = null;
    let nearestDist = 9999;

    // Check local hero if opposing team
    if (window.hero && state.hero.team !== this.team && !state.hero.isDowned) {
      const d = this.position.distanceTo(window.hero.position);
      if (d < nearestDist) {
        nearestDist = d;
        nearestTarget = window.hero;
      }
    }

    // Check opposing bots
    pvpEngine.botEntities.forEach(other => {
      if (other !== this && other.team !== this.team && !other.isDead) {
        const d = this.position.distanceTo(other.position);
        if (d < nearestDist) {
          nearestDist = d;
          nearestTarget = other;
        }
      }
    });

    // Destination target (either nearest enemy, or center arena anvil)
    let dest = new THREE.Vector3(0, 0, 0);
    if (nearestTarget) {
      dest = nearestTarget.position;
    }

    const toDest = new THREE.Vector3().subVectors(dest, this.position);
    toDest.y = 0;
    const dist = toDest.length();

    if (dist > 0.1) {
      toDest.normalize();
      this.group.rotation.y = Math.atan2(toDest.x, toDest.z);
    }

    // Combat Range Engagement
    const attackRange = this.classId === 'gunner' ? 8.5 : (this.classId === 'arcanist' ? 7.0 : 2.5);

    if (dist > attackRange) {
      this.position.x += toDest.x * this.speed * dt;
      this.position.z += toDest.z * this.speed * dt;
    } else if (nearestTarget && this.attackCooldown <= 0) {
      // Execute Attack against opposing target
      this.attackCooldown = this.classId === 'melee' ? 0.75 : 1.1;
      const isCrit = Math.random() < 0.2;
      const dmg = this.attackDamage * (isCrit ? 1.6 : 1.0);

      if (nearestTarget === window.hero) {
        window.damagePlayer(dmg, true);
        sound.playHit();
      } else {
        nearestTarget.takeDamage(dmg, isCrit, this.name);
        sound.playHit();
      }

      // Visuals
      if (this.classId === 'gunner') {
        spawnGunnerBolts(this.position, toDest);
        sound.playLaserShot();
      } else if (this.classId === 'arcanist') {
        spawnArcanistSpark(this.position, toDest);
        sound.playMagicSpark();
      } else {
        sound.playSlash();
        spawnSlashWave(this.position, toDest, 0);
      }
    }

    // Occasional Special Nova Cast
    if (nearestTarget && dist < 12 && this.specialCooldown <= 0) {
      this.specialCooldown = 9.0;
      sound.playNova();
      spawnGroundShockwave(this.position, 10.0, this.team === 'blue' ? 0x00f0ff : 0xff0054);
      if (nearestTarget === window.hero) {
        window.damagePlayer(this.attackDamage * 1.8, true);
      } else {
        nearestTarget.takeDamage(this.attackDamage * 1.8, true, this.name);
      }
    }
  }
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>'"]/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[tag] || tag));
}

const pvpEngine = new PvPEngine();
export { pvpEngine, PvPEngine };
window.pvpEngine = pvpEngine;
