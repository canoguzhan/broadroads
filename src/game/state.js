/* Game State Management */
    const state = {
      phase: 'title', // 'title', 'playing', 'refinery', 'gameover', 'victory'
      gameMode: 'solo', // 'solo', 'multiplayer'
      soloSubMode: 'classic', // 'classic', 'endless'
      heroClass: 'paladin', // 'paladin', 'gunner', 'arcanist'

      // Profile & Theming
      username: localStorage.getItem('broadroads_username') || ('Commander_' + Math.floor(100 + Math.random() * 900)),
      currentMonth: new Date().getMonth(), // Automatically locked to current calendar month
      selectedClassIndex: 0,
      activeClassData: null,
      platform: 'desktop', // 'desktop' or 'mobile'
      guestIsReady: false,

      currentWave: 1,
      waveTimeRemaining: GAME_CONFIG.WAVE_DURATION,
      refineryTimeRemaining: GAME_CONFIG.REFINERY_DURATION,
      runTimer: 0,
      kills: 0,
      totalDamageDealt: 0,
      gearRefinedCount: 0,

      // Local Player Stats
      hero: {
        hp: 140,
        maxHp: 140,
        shield: 60,
        maxShield: 60,
        shieldRegenTimer: 0,
        attackDamage: 32,
        attackSpeed: 1.0,
        moveSpeed: 8.5,
        critChance: 0.15,
        critMult: 1.8,
        dashCooldown: 1.1,
        dashTimer: 0,
        isDashing: false,
        dashDuration: 0,
        dashDirection: new THREE.Vector3(0, 0, 1),
        specialCharge: 100, // Starts 100% Ready!
        specialMaxCharge: 100,
        autoAttack: false,
        attackCombo: 0,
        attackCooldown: 0,
        invincibleTimer: 0,
        ultimateCooldown: 0,
        isDowned: false,
        reviveProgress: 0
      },

      revivingTarget: null,
      reviveProgress: 0,

      materials: {
        pyrite: 2,
        aether: 2,
        titanium: 2,
        catalyst: 1
      },

      gear: {
        weapon: { name: 'Broad Blade', tier: 1, icon: '⚔️', stat: '+25 ATK' },
        armor: { name: 'Iron Cuirass', tier: 1, icon: '🛡️', stat: '+120 HP' },
        boots: { name: 'Runic Striders', tier: 1, icon: '🥾', stat: '+0% SPD' },
        relic: { name: 'Void Ring', tier: 1, icon: '💍', stat: '+10% CRIT' }
      },

      // 1,000 Dungeons Progression & NeonDB Account
      dungeonFloor: parseInt(localStorage.getItem('broadroads_dungeon_floor'), 10) || 1,
      dungeonLevel: parseInt(localStorage.getItem('broadroads_dungeon_level'), 10) || 1,
      totalDungeonsCleared: parseInt(localStorage.getItem('broadroads_dungeons_cleared'), 10) || 0,
      maxFloorReached: parseInt(localStorage.getItem('broadroads_max_floor'), 10) || 1,
      accountUser: JSON.parse(localStorage.getItem('broadroads_user') || 'null'),
      killStreak: 0,
      lastKillTime: 0,
      firstBloodAwarded: false,

      crucible: {
        slot1: null,
        slot2: null,
        predictedRecipe: null
      }
    };


export { state };
window.state = state;

