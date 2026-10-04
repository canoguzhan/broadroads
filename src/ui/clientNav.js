/* BROADROADS - LoL-Style Client Flow, Navigation & Profile Controller */
import { sound } from '../audio/sound.js';
import { state } from '../game/state.js';
import { pvpEngine } from '../game/pvp.js';
import { friendsManager } from '../services/friends.js';
import { showLolBanner } from '../game/combat.js';

class ClientNavigationController {
  constructor() {
    this.selectedMode = 'pvp'; // Default to exciting new 5v5 PvP!
    this.champSelectTimer = null;
    this.isLockedIn = false;
  }

  init() {
    this.bindTopNav();
    this.bindModeSelection();
    this.bindLobbyActions();
    this.bindChampSelect();
    this.bindProfileModal();
    this.bindFriendsDock();
    this.updateUserDisplay();

    // Start in mode select view
    this.showModeSelect();
  }

  updateUserDisplay() {
    const nameEl = document.getElementById('client-username-display');
    const lvlEl = document.getElementById('client-level-badge');
    const avatarEl = document.getElementById('client-avatar-badge');

    if (nameEl) nameEl.textContent = state.username;
    if (lvlEl) lvlEl.textContent = `LV. ${state.dungeonLevel || 1}`;
    if (avatarEl) {
      const classIcons = { paladin: '🛡️', gunner: '🏹', arcanist: '🔮' };
      avatarEl.textContent = classIcons[state.heroClass] || '🛡️';
    }
  }

  showModeSelect() {
    state.clientPhase = 'mode_select';
    this.hideAllViews();
    const modal = document.getElementById('start-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
    }
    const modeSelectView = document.getElementById('view-mode-select');
    if (modeSelectView) modeSelectView.style.display = 'flex';

    // Highlight selected card
    document.querySelectorAll('.mode-card-tile').forEach(card => {
      if (card.dataset.mode === this.selectedMode) {
        card.classList.add('selected');
      } else {
        card.classList.remove('selected');
      }
    });

    this.updateModeSelectFooter();
  }

  selectMode(modeId) {
    sound.playPickup();
    this.selectedMode = modeId;
    state.selectedMode = modeId;

    if (modeId === 'pvp') {
      state.gameMode = 'pvp';
    } else if (modeId === 'coop') {
      state.gameMode = 'multiplayer';
    } else {
      state.gameMode = 'solo';
      state.soloSubMode = modeId; // 'dungeon', 'classic', 'endless'
    }

    document.querySelectorAll('.mode-card-tile').forEach(card => {
      if (card.dataset.mode === modeId) {
        card.classList.add('selected');
      } else {
        card.classList.remove('selected');
      }
    });

    this.updateModeSelectFooter();
  }

  updateModeSelectFooter() {
    const descEl = document.getElementById('mode-select-summary-text');
    const titleEl = document.getElementById('mode-select-summary-title');
    const descriptions = {
      pvp: { title: '⚔️ 5v5 PvP BATTLEGROUND', desc: 'Tactical team warfare on an expanded arena. Blue Team vs Red Team with team bases, minimap & 15 kill objective.' },
      coop: { title: '🌐 SQUAD CO-OP SURVIVAL', desc: '2 to 4 Players peer-to-peer survival against scaling hordes. Synthesize legendary gear in the crucible forge.' },
      dungeon: { title: '🏰 1,000 DUNGEONS: THE CRUCIBLE', desc: 'Conquer 1,000 ascending dungeon floors. Level up permanently to Lv. 100 with epic world bosses every 10 floors.' },
      classic: { title: '🏆 CLASSIC SURVIVAL', desc: 'Survive 5 intense waves culminating in the Forge Overlord boss confrontation.' },
      endless: { title: '♾️ ENDLESS HORDE', desc: 'Infinite scaling waves of monsters with recurring bosses. Test your ultimate gear build!' }
    };

    const info = descriptions[this.selectedMode] || descriptions.pvp;
    if (titleEl) titleEl.textContent = info.title;
    if (descEl) descEl.textContent = info.desc;
  }

  showLobby() {
    sound.playFanfare();
    state.clientPhase = 'lobby';
    this.hideAllViews();
    const lobbyView = document.getElementById('view-lobby');
    if (lobbyView) lobbyView.style.display = 'flex';

    // Show appropriate lobby subpanel
    const pvpPanel = document.getElementById('lobby-pvp-panel');
    const coopPanel = document.getElementById('lobby-coop-panel');
    const soloPanel = document.getElementById('lobby-solo-panel');

    if (this.selectedMode === 'pvp') {
      if (pvpPanel) pvpPanel.style.display = 'flex';
      if (coopPanel) coopPanel.style.display = 'none';
      if (soloPanel) soloPanel.style.display = 'none';
      pvpEngine.initLobby();
    } else if (this.selectedMode === 'coop') {
      if (pvpPanel) pvpPanel.style.display = 'none';
      if (coopPanel) coopPanel.style.display = 'flex';
      if (soloPanel) soloPanel.style.display = 'none';
      if (window.net) {
        window.net.initHostRoom();
      }
    } else {
      if (pvpPanel) pvpPanel.style.display = 'none';
      if (coopPanel) coopPanel.style.display = 'none';
      if (soloPanel) soloPanel.style.display = 'flex';
      this.updateSoloLobbyDetails();
    }
  }

  updateSoloLobbyDetails() {
    const modeBadge = document.getElementById('solo-lobby-mode-name');
    const modeDesc = document.getElementById('solo-lobby-desc');
    const dungeonBadges = document.getElementById('solo-lobby-dungeon-badges');
    const floorPill = document.getElementById('solo-lobby-floor');
    const lvlPill = document.getElementById('solo-lobby-level');

    if (this.selectedMode === 'dungeon') {
      if (modeBadge) modeBadge.textContent = '🏰 1,000 DUNGEONS: THE CRUCIBLE';
      if (modeDesc) modeDesc.textContent = 'Ascend 1,000 floors. Defeat bosses every 10 floors for permanent +15 HP, +3 ATK, +10 Shield stat upgrades!';
      if (dungeonBadges) dungeonBadges.style.display = 'flex';
      if (floorPill) floorPill.textContent = `FLOOR: ${state.dungeonFloor || 1} / 1000`;
      if (lvlPill) lvlPill.textContent = `LEVEL: ${state.dungeonLevel || 1} / 100`;
    } else if (this.selectedMode === 'endless') {
      if (modeBadge) modeBadge.textContent = '♾️ ENDLESS HORDE SURVIVAL';
      if (modeDesc) modeDesc.textContent = 'Non-stop scaling hordes with no wave ceiling. Survive as long as your tactical refinery gear holds out!';
      if (dungeonBadges) dungeonBadges.style.display = 'none';
    } else {
      if (modeBadge) modeBadge.textContent = '🏆 CLASSIC ARENA SURVIVAL';
      if (modeDesc) modeDesc.textContent = '5 High-octane survival waves followed by the Forge Overlord final boss battle.';
      if (dungeonBadges) dungeonBadges.style.display = 'none';
    }
  }

  showChampSelect() {
    sound.playFanfare();
    state.clientPhase = 'champ_select';
    this.isLockedIn = false;
    this.hideAllViews();
    const champView = document.getElementById('view-champ-select');
    if (champView) champView.style.display = 'grid';

    // Render current monthly theme champions
    if (window.renderClassSelectionCards) {
      window.renderClassSelectionCards(state.currentMonth);
    }

    const lockBtn = document.getElementById('btn-lock-in-champion');
    if (lockBtn) {
      lockBtn.disabled = false;
      lockBtn.classList.remove('locked');
      lockBtn.textContent = '🔒 LOCK IN CHAMPION';
    }

    // Render team roster in champ select
    this.renderChampSelectTeamPicks();
  }

  renderChampSelectTeamPicks() {
    const teamContainer = document.getElementById('champ-select-team-roster');
    if (!teamContainer) return;
    teamContainer.innerHTML = '';

    let members = [];
    if (state.gameMode === 'pvp') {
      const myTeam = state.hero.team === 'blue' ? pvpEngine.blueTeam : pvpEngine.redTeam;
      members = myTeam;
    } else if (state.gameMode === 'multiplayer' && window.net) {
      members = window.net.getPlayerRoster();
    } else {
      members = [{ name: state.username, isLocal: true, classId: state.heroClass }];
    }

    members.forEach(m => {
      const card = document.createElement('div');
      card.className = `champ-pick-card ${m.isLocal ? 'is-local' : ''}`;
      const classIcons = { paladin: '🛡️', gunner: '🏹', arcanist: '🔮' };
      card.innerHTML = `
        <div class="champ-pick-avatar">${classIcons[m.classId || 'paladin'] || '🛡️'}</div>
        <div class="champ-pick-info">
          <span class="champ-pick-name">${escapeHtml(m.name || 'Commander')}</span>
          <span class="champ-pick-status">LOCKED IN</span>
        </div>
      `;
      teamContainer.appendChild(card);
    });
  }

  lockInChampion() {
    if (this.isLockedIn) return;
    this.isLockedIn = true;
    sound.playFanfare();

    const lockBtn = document.getElementById('btn-lock-in-champion');
    if (lockBtn) {
      lockBtn.disabled = true;
      lockBtn.classList.add('locked');
      lockBtn.textContent = '✨ CHAMPION LOCKED IN!';
    }

    showLolBanner('CHAMPION LOCKED IN!', `${state.heroClass.toUpperCase()} READY FOR ARENA DEPLOYMENT`);

    // Transition directly into arena
    setTimeout(() => {
      const modal = document.getElementById('start-modal');
      if (modal) {
        modal.style.display = 'none';
        modal.classList.add('hidden');
      }

      if (state.gameMode === 'pvp') {
        pvpEngine.startPvPMatch();
      } else {
        if (window.startMatchWithLoadingScreen && window.resetGame) {
          window.startMatchWithLoadingScreen(() => window.resetGame());
        }
      }
    }, 1000);
  }

  hideAllViews() {
    const v1 = document.getElementById('view-mode-select');
    const v2 = document.getElementById('view-lobby');
    const v3 = document.getElementById('view-champ-select');
    if (v1) v1.style.display = 'none';
    if (v2) v2.style.display = 'none';
    if (v3) v3.style.display = 'none';
  }

  openProfileModal(targetUser = null) {
    sound.playPickup();
    const modal = document.getElementById('profile-modal');
    if (!modal) return;
    modal.style.display = 'flex';

    const isSelf = !targetUser || targetUser.username === state.username;
    const profileName = isSelf ? state.username : targetUser.username;
    const profileLvl = isSelf ? (state.dungeonLevel || 1) : (targetUser.level || 1);
    const profileRank = isSelf ? this.calculateRankTier(state.dungeonFloor, state.pvp.stats.wins) : (targetUser.rank || 'Silver II');
    const profileAvatar = isSelf ? (state.heroClass === 'gunner' ? '🏹' : (state.heroClass === 'arcanist' ? '🔮' : '🛡️')) : (targetUser.classId === 'gunner' ? '🏹' : (targetUser.classId === 'arcanist' ? '🔮' : '🛡️'));

    document.getElementById('profile-display-name').textContent = profileName.toUpperCase();
    document.getElementById('profile-display-lvl').textContent = `LEVEL ${profileLvl} / 100`;
    document.getElementById('profile-display-rank').textContent = profileRank.toUpperCase();
    document.getElementById('profile-display-avatar').textContent = profileAvatar;

    // Statistics Grid
    document.getElementById('profile-stat-dungeons').textContent = isSelf ? (state.totalDungeonsCleared || 0) : '38';
    document.getElementById('profile-stat-floor').textContent = isSelf ? (state.maxFloorReached || 1) : '42';
    document.getElementById('profile-stat-pvp-wins').textContent = isSelf ? (state.pvp.stats.wins || 0) : '14';
    document.getElementById('profile-stat-pvp-kills').textContent = isSelf ? (state.pvp.stats.kills || 0) : '67';
    document.getElementById('profile-stat-refined').textContent = isSelf ? (state.gearRefinedCount || 0) : '29';

    const winRate = isSelf 
      ? (state.pvp.stats.wins + state.pvp.stats.losses > 0 
          ? Math.round((state.pvp.stats.wins / (state.pvp.stats.wins + state.pvp.stats.losses)) * 100) + '%' 
          : '100%')
      : '64%';
    document.getElementById('profile-stat-winrate').textContent = winRate;
  }

  calculateRankTier(floor, pvpWins) {
    const score = (floor || 1) * 2 + (pvpWins || 0) * 5;
    if (score >= 250) return 'Challenger';
    if (score >= 180) return 'Grandmaster';
    if (score >= 120) return 'Master';
    if (score >= 70) return 'Diamond II';
    if (score >= 40) return 'Platinum III';
    if (score >= 20) return 'Gold I';
    if (score >= 10) return 'Silver II';
    return 'Bronze I';
  }

  closeProfileModal() {
    const modal = document.getElementById('profile-modal');
    if (modal) modal.style.display = 'none';
  }

  toggleFriendsList(forceOpen = null) {
    sound.playPickup();
    const sidebar = document.getElementById('friends-sidebar');
    if (!sidebar) return;

    if (forceOpen === true) {
      sidebar.classList.add('open');
    } else if (forceOpen === false) {
      sidebar.classList.remove('open');
    } else {
      sidebar.classList.toggle('open');
    }

    if (sidebar.classList.contains('open')) {
      friendsManager.renderFriendsList();
    }
  }

  acceptInviteAndJoin(mode, roomCode) {
    if (mode === 'pvp') {
      this.selectMode('pvp');
      this.showLobby();
    } else {
      this.selectMode('coop');
      this.showLobby();
      if (window.net) {
        window.net.joinRoom(roomCode);
      }
    }
  }

  bindTopNav() {
    const btnPlay = document.getElementById('btn-client-nav-play');
    if (btnPlay) btnPlay.addEventListener('click', () => {
      sound.playPickup();
      this.showModeSelect();
    });

    const btnProfile = document.getElementById('btn-client-nav-profile');
    if (btnProfile) btnProfile.addEventListener('click', () => this.openProfileModal());

    const profileCapsule = document.getElementById('header-profile-capsule');
    if (profileCapsule) profileCapsule.addEventListener('click', () => this.openProfileModal());

    const btnFriendsToggle = document.getElementById('btn-friends-dock-toggle');
    if (btnFriendsToggle) btnFriendsToggle.addEventListener('click', () => this.toggleFriendsList());
  }

  bindModeSelection() {
    document.querySelectorAll('.mode-card-tile').forEach(card => {
      card.addEventListener('click', () => {
        const mode = card.dataset.mode;
        this.selectMode(mode);
      });
    });

    const btnConfirmMode = document.getElementById('btn-confirm-game-mode');
    if (btnConfirmMode) btnConfirmMode.addEventListener('click', () => {
      this.showLobby();
    });
  }

  bindLobbyActions() {
    // Back to Mode Select buttons
    document.querySelectorAll('.btn-back-to-modes').forEach(btn => {
      btn.addEventListener('click', () => {
        sound.playPickup();
        this.showModeSelect();
      });
    });

    // PvP Team Selection Buttons
    const btnJoinBlue = document.getElementById('btn-pvp-join-blue');
    if (btnJoinBlue) btnJoinBlue.addEventListener('click', (e) => {
      e.stopPropagation();
      pvpEngine.setPlayerSide('blue');
    });

    const btnJoinRed = document.getElementById('btn-pvp-join-red');
    if (btnJoinRed) btnJoinRed.addEventListener('click', (e) => {
      e.stopPropagation();
      pvpEngine.setPlayerSide('red');
    });

    // Bot Fill Button
    const btnFillBots = document.getElementById('btn-pvp-fill-bots');
    if (btnFillBots) {
      btnFillBots.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        pvpEngine.fillWithAIBots();
      });
    }

    // Proceed to Champ Select buttons
    const btnProceedPvP = document.getElementById('btn-pvp-proceed-champ');
    if (btnProceedPvP) btnProceedPvP.addEventListener('click', () => this.showChampSelect());

    const btnProceedSolo = document.getElementById('btn-solo-proceed-champ');
    if (btnProceedSolo) btnProceedSolo.addEventListener('click', () => this.showChampSelect());

    const btnProceedCoop = document.getElementById('btn-coop-proceed-champ');
    if (btnProceedCoop) btnProceedCoop.addEventListener('click', () => this.showChampSelect());
  }

  bindChampSelect() {
    const btnBackToLobby = document.getElementById('btn-back-to-lobby');
    if (btnBackToLobby) btnBackToLobby.addEventListener('click', () => {
      sound.playPickup();
      this.showLobby();
    });

    const btnLockIn = document.getElementById('btn-lock-in-champion');
    if (btnLockIn) btnLockIn.addEventListener('click', () => this.lockInChampion());
  }

  bindProfileModal() {
    const closeBtn = document.getElementById('btn-profile-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this.closeProfileModal());
  }

  bindFriendsDock() {
    const closeFriendsBtn = document.getElementById('btn-friends-close');
    if (closeFriendsBtn) closeFriendsBtn.addEventListener('click', () => this.toggleFriendsList(false));

    const addFriendBtn = document.getElementById('btn-add-friend-submit');
    const addFriendInput = document.getElementById('input-add-friend');
    if (addFriendBtn && addFriendInput) {
      addFriendBtn.addEventListener('click', () => {
        const name = addFriendInput.value.trim();
        if (name) {
          const res = friendsManager.addFriend(name);
          addFriendInput.value = '';
          friendsManager.showToast(res.message || res.error, res.success ? 'success' : 'error');
        }
      });
      addFriendInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          addFriendBtn.click();
        }
      });
    }

    // Chat dock close & send
    const closeChatBtn = document.getElementById('btn-chat-dock-close');
    if (closeChatBtn) closeChatBtn.addEventListener('click', () => friendsManager.closeChat());

    const sendChatBtn = document.getElementById('btn-chat-dock-send');
    const chatInput = document.getElementById('chat-dock-input');
    if (sendChatBtn && chatInput) {
      sendChatBtn.addEventListener('click', () => {
        const text = chatInput.value.trim();
        if (text) {
          friendsManager.sendMessage(text);
          chatInput.value = '';
        }
      });
      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          sendChatBtn.click();
        }
      });
    }
  }
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>'"]/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[tag] || tag));
}

const clientNav = new ClientNavigationController();
export { clientNav, ClientNavigationController };
window.clientNav = clientNav;
