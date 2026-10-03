/* Squad Poll Vote & Match Exit Managers */
    const pollState = {
      active: false,
      timer: 15,
      interval: null,
      myVote: null,
      votes: new Map(), // voterId -> 'end' | 'continue'
      totalHumans: 1,
      departedName: ''
    };

    function startSquadPollVote(departedName, incomingTotalHumans) {
      if (pollState.active) return;
      pollState.active = true;
      pollState.timer = 15;
      pollState.myVote = null;
      pollState.votes.clear();
      pollState.departedName = departedName || 'Squadmate';

      if (net.isHost) {
        pollState.totalHumans = Math.max(1, net.connections.size + 1);
        net.broadcast({
          type: 'POLL_VOTE_START',
          departedName: pollState.departedName,
          totalHumans: pollState.totalHumans
        });
      } else {
        pollState.totalHumans = incomingTotalHumans || 2;
      }

      const modal = document.getElementById('poll-vote-modal');
      if (modal) modal.style.display = 'flex';

      const descEl = document.getElementById('poll-vote-desc');
      if (descEl) {
        descEl.textContent = `A squadmate (${pollState.departedName}) has departed. An autonomous AI Bot has assumed command. Vote whether to return to the lobby or continue fighting:`;
      }

      const btnEnd = document.getElementById('btn-vote-end');
      const btnCont = document.getElementById('btn-vote-continue');
      if (btnEnd) {
        btnEnd.disabled = false;
        btnEnd.classList.remove('voted');
        btnEnd.textContent = '🛑 End Match';
      }
      if (btnCont) {
        btnCont.disabled = false;
        btnCont.classList.remove('voted');
        btnCont.textContent = '⚔️ Continue With AI';
      }

      const fill = document.getElementById('poll-timer-fill');
      if (fill) fill.style.width = '100%';

      const text = document.getElementById('poll-timer-text');
      if (text) text.textContent = 'Time remaining: 15s';

      updatePollTallyUI(0, 0, pollState.totalHumans);

      if (pollState.interval) clearInterval(pollState.interval);
      pollState.interval = setInterval(() => {
        pollState.timer--;
        const pct = Math.max(0, (pollState.timer / 15) * 100);
        if (fill) fill.style.width = `${pct}%`;
        if (text) text.textContent = `Time remaining: ${Math.max(0, pollState.timer)}s`;

        if (pollState.timer <= 0) {
          clearInterval(pollState.interval);
          if (net.isHost || !net.peer) {
            let endCount = 0, continueCount = 0;
            pollState.votes.forEach(v => { if (v === 'end') endCount++; else continueCount++; });
            const decision = (endCount / pollState.totalHumans >= 0.5) ? 'end' : 'continue';
            if (net.isHost) {
              net.broadcast({ type: 'POLL_VOTE_RESOLVED', decision: decision, endCount, continueCount });
            }
            resolvePollVote(decision, endCount, continueCount);
          }
        }
      }, 1000);
    }

    function castPollVote(choice) {
      if (!pollState.active || pollState.myVote) return;
      pollState.myVote = choice;

      const btnEnd = document.getElementById('btn-vote-end');
      const btnCont = document.getElementById('btn-vote-continue');
      if (choice === 'end') {
        if (btnEnd) { btnEnd.classList.add('voted'); btnEnd.textContent = '🛑 End Match (Voted)'; }
        if (btnCont) btnCont.disabled = true;
      } else {
        if (btnCont) { btnCont.classList.add('voted'); btnCont.textContent = '⚔️ Continue (Voted)'; }
        if (btnEnd) btnEnd.disabled = true;
      }

      const myId = (net && net.myId) ? net.myId : 'host';
      recordPollVote(myId, choice);

      if (net && net.peer && !net.isHost) {
        net.send({ type: 'CAST_POLL_VOTE', voterId: myId, vote: choice });
      }
    }

    function recordPollVote(voterId, vote) {
      pollState.votes.set(voterId, vote);

      let endCount = 0, continueCount = 0;
      pollState.votes.forEach(v => {
        if (v === 'end') endCount++;
        else continueCount++;
      });

      if (net.isHost) {
        net.broadcast({
          type: 'POLL_VOTE_TALLY',
          endCount: endCount,
          continueCount: continueCount,
          totalHumans: pollState.totalHumans
        });
      }
      updatePollTallyUI(endCount, continueCount, pollState.totalHumans);

      // Check if threshold >= 50% end votes is reached
      if (net.isHost || !net.peer) {
        if (endCount / pollState.totalHumans >= 0.5) {
          if (pollState.interval) clearInterval(pollState.interval);
          if (net.isHost) {
            net.broadcast({ type: 'POLL_VOTE_RESOLVED', decision: 'end', endCount, continueCount });
          }
          resolvePollVote('end', endCount, continueCount);
        } else if (pollState.votes.size >= pollState.totalHumans) {
          if (pollState.interval) clearInterval(pollState.interval);
          if (net.isHost) {
            net.broadcast({ type: 'POLL_VOTE_RESOLVED', decision: 'continue', endCount, continueCount });
          }
          resolvePollVote('continue', endCount, continueCount);
        }
      }
    }

    function updatePollTallyUI(endCount, continueCount, total) {
      const tallyEl = document.getElementById('poll-tally-text');
      if (tallyEl) {
        tallyEl.textContent = `Votes: ${endCount} End vs ${continueCount} Continue (${endCount + continueCount}/${total} Voted • ≥ 50% End returns to lobby)`;
      }
    }

    function resolvePollVote(decision, endCount, continueCount) {
      if (!pollState.active) return;
      pollState.active = false;
      if (pollState.interval) clearInterval(pollState.interval);

      const modal = document.getElementById('poll-vote-modal');
      if (modal) modal.style.display = 'none';

      if (decision === 'end') {
        returnToLobby();
      } else {
        const banner = document.getElementById('revive-banner');
        if (banner) {
          banner.style.display = 'block';
          banner.style.borderColor = 'var(--neon-cyan)';
          banner.textContent = `⚔️ SQUAD DECISION: CONTINUING BATTLE WITH AI SQUADMATE!`;
          setTimeout(() => { if (banner && !state.hero.isDowned) banner.style.display = 'none'; }, 4000);
        }
      }
    }

    function closePollVoteModal() {
      pollState.active = false;
      if (pollState.interval) clearInterval(pollState.interval);
      const modal = document.getElementById('poll-vote-modal');
      if (modal) modal.style.display = 'none';
    }

    function openExitConfirmModal() {
      state.isExitPaused = true;
      const modal = document.getElementById('exit-confirm-modal');
      if (modal) modal.style.display = 'flex';
    }

    function closeExitConfirmModal() {
      state.isExitPaused = false;
      const modal = document.getElementById('exit-confirm-modal');
      if (modal) modal.style.display = 'none';
    }

    function executeExitMatch() {
      closeExitConfirmModal();
      if (state.gameMode === 'multiplayer') {
        if (net.isHost) {
          net.broadcast({ type: 'HOST_EXITED', username: state.username });
        } else {
          net.send({ type: 'GUEST_EXITED', peerId: net.myId, username: state.username });
        }
        if (net.peer) {
          try { net.peer.destroy(); } catch(e){}
          net.peer = null;
        }
      }
      returnToLobby();
    }

    function returnToLobby() {
      state.phase = 'title';
      state.isExitPaused = false;
      closePollVoteModal();
      closeExitConfirmModal();

      const hideIds = [
        'refinery-modal', 'gameover-modal', 'revive-banner', 'boss-hud',
        'lol-top-hud', 'lol-bottom-console', 'lol-minimap-container',
        'lol-boss-bar-container', 'lol-announcement-banner', 'lol-allies-hud'
      ];
      hideIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });

      document.querySelectorAll('.mobile-controls').forEach(el => {
        el.style.display = 'none';
      });

      // Clean arena entities safely
      try {
        enemies.forEach(e => { try { e.destroy(); } catch(err){} });
        enemies.length = 0;
      } catch(e){}

      try {
        if (typeof droppedMaterials !== 'undefined' && Array.isArray(droppedMaterials)) {
          droppedMaterials.forEach(m => {
            try { if (m && m.mesh) scene.remove(m.mesh); } catch(err){}
          });
          droppedMaterials.length = 0;
        }
      } catch(e){}

      try {
        slashWaves.forEach(w => { try { scene.remove(w.mesh); } catch(err){} });
        slashWaves.length = 0;
        projectiles.forEach(p => { try { scene.remove(p.mesh); } catch(err){} });
        projectiles.length = 0;
        gunnerRockets.forEach(r => { try { scene.remove(r.mesh); } catch(err){} });
        gunnerRockets.length = 0;
        blackHoles.forEach(h => { try { scene.remove(h.mesh); } catch(err){} });
        blackHoles.length = 0;
        shockwaves.forEach(w => { try { scene.remove(w.mesh); } catch(err){} });
        shockwaves.length = 0;
        explosions.forEach(x => { try { scene.remove(x.pSystem); } catch(err){} });
        explosions.length = 0;
      } catch(e){}

      if (hero) {
        hero.position.set(0, 0, 0);
        hero.velocity.set(0, 0);
        state.hero.health = state.hero.maxHealth;
        state.hero.shield = state.hero.maxShield;
        state.hero.isDowned = false;
      }
      camera.position.set(0, 22, 22);
      camera.lookAt(0, 0, 0);

      try { net.removeAllRemoteHeroes(); } catch(e){}
      updateTeammatesHUD();

      // Show Start/Lobby Modal
      const startModal = document.getElementById('start-modal');
      if (startModal) startModal.style.display = 'flex';

      if (state.gameMode === 'multiplayer') {
        if (net.isHost) {
          net.initHost();
        } else {
          const guestPill = document.getElementById('guest-status-pill');
          if (guestPill) guestPill.textContent = 'Enter room number above and click Ready';
          const guestRoster = document.getElementById('guest-lobby-roster');
          if (guestRoster) guestRoster.style.display = 'flex';
          const guestReadyBtn = document.getElementById('btn-guest-ready');
          if (guestReadyBtn) {
            guestReadyBtn.style.display = 'block';
            guestReadyBtn.classList.remove('ready');
            guestReadyBtn.textContent = '🔴 CLICK TO READY UP';
          }
          state.guestIsReady = false;
        }
      }
      if (typeof updateStartModalButtons === 'function') updateStartModalButtons();
    }

    function openShortcutsModal() {
      const modal = document.getElementById('shortcuts-modal');
      if (modal) modal.style.display = 'flex';
    }

    function closeShortcutsModal() {
      const modal = document.getElementById('shortcuts-modal');
      if (modal) modal.style.display = 'none';
    }

export {
  pollState, startSquadPollVote, castPollVote, recordPollVote,
  updatePollTallyUI, resolvePollVote, closePollVoteModal,
  openExitConfirmModal, closeExitConfirmModal, executeExitMatch,
  returnToLobby, openShortcutsModal, closeShortcutsModal
};
window.pollState = pollState;
window.startSquadPollVote = startSquadPollVote;
window.castPollVote = castPollVote;
window.recordPollVote = recordPollVote;
window.updatePollTallyUI = updatePollTallyUI;
window.resolvePollVote = resolvePollVote;
window.closePollVoteModal = closePollVoteModal;
window.openExitConfirmModal = openExitConfirmModal;
window.closeExitConfirmModal = closeExitConfirmModal;
window.executeExitMatch = executeExitMatch;
window.returnToLobby = returnToLobby;
window.openShortcutsModal = openShortcutsModal;
window.closeShortcutsModal = closeShortcutsModal;

