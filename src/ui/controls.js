/* Platform Detection, Desktop Controls & Mobile Virtual Joystick */
    function bindAction(el, callback) {
      if (!el) return;
      let lastTrigger = 0;
      const trigger = (e) => {
        const now = Date.now();
        if (now - lastTrigger < 100) return;
        lastTrigger = now;
        if (e) e.stopPropagation();
        sound.init();
        callback();
      };
      el.addEventListener('pointerdown', trigger, { passive: true });
      el.addEventListener('click', trigger);
    }

    const clickRipples = [];
    function spawnClickRipple(x, z) {
      const geo = new THREE.RingGeometry(0.2, 0.45, 24);
      const mat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.95, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, 0.05, z);
      scene.add(mesh);
      clickRipples.push({ mesh, life: 0.35, maxLife: 0.35 });
    }

    bindAction(document.getElementById('btn-attack'), performHeroAttack);
    bindAction(document.getElementById('btn-dash'), performDash);
    bindAction(document.getElementById('btn-special'), performSpecialNova);
    bindAction(document.getElementById('btn-auto'), toggleAutoAttack);
    bindAction(document.getElementById('btn-mobile-ultimate'), performUltimate);
    bindAction(document.getElementById('btn-mobile-recall'), () => {
      if (state.phase === 'refinery') {
        document.getElementById('refinery-modal').style.display = 'flex';
      } else {
        showLolBanner('RECALL CHANNELING', 'REFINERY FORGE OPENS AT WAVE END');
      }
    });

    const lolItemsWing = document.querySelector('.lol-items-wing');
    if (lolItemsWing) {
      bindAction(lolItemsWing, () => {
        if (state.phase === 'refinery') {
          document.getElementById('refinery-modal').style.display = 'flex';
        } else {
          showLolBanner('EQUIPPED ARSENAL', 'VISIT FORGE AT WAVE COMPLETION');
        }
      });
    }

    // League of Legends Action Console Buttons
    bindAction(document.getElementById('btn-lol-q'), performHeroAttack);
    bindAction(document.getElementById('btn-lol-w'), performDash);
    bindAction(document.getElementById('btn-lol-e'), performSpecialNova);
    bindAction(document.getElementById('btn-lol-r'), performUltimate);
    bindAction(document.getElementById('btn-lol-d'), performDash);
    bindAction(document.getElementById('btn-lol-f'), toggleAutoAttack);
    bindAction(document.getElementById('btn-lol-b'), () => {
      if (state.phase === 'refinery') {
        document.getElementById('refinery-modal').style.display = 'flex';
      } else {
        showLolBanner('RECALL CHANNELING', 'REFINERY FORGE OPENS AT WAVE END');
      }
    });

    const btnLolHelp = document.getElementById('btn-lol-help');
    if (btnLolHelp) bindAction(btnLolHelp, openShortcutsModal);
    const btnLolExit = document.getElementById('btn-lol-exit');
    if (btnLolExit) bindAction(btnLolExit, openExitConfirmModal);

    container.addEventListener('pointerdown', (e) => {
      sound.init();
      if (state.phase !== 'playing') return;

      const rect = container.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);
      const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const targetPoint = new THREE.Vector3();
      raycaster.ray.intersectPlane(floorPlane, targetPoint);

      if (e.button === 2) {
        // Classic League of Legends Right-Click: Move or Attack Target
        if (targetPoint) {
          let clickedEnemy = null;
          enemies.forEach(en => {
            if (!en.dead && en.position.distanceTo(targetPoint) < 2.0) {
              clickedEnemy = en;
            }
          });

          if (clickedEnemy) {
            hero.targetRotation = Math.atan2(clickedEnemy.position.x - hero.position.x, clickedEnemy.position.z - hero.position.z);
            hero.group.rotation.y = hero.targetRotation;
            if (hero.position.distanceTo(clickedEnemy.position) <= 4.0) {
              performHeroAttack();
            } else {
              hero.moveTarget = clickedEnemy.position.clone();
            }
          } else {
            hero.moveTarget = targetPoint.clone();
            spawnClickRipple(targetPoint.x, targetPoint.z);
          }
        }
        return;
      }

      // Left-Click: Aim & Attack towards cursor
      if (targetPoint) {
        hero.targetRotation = Math.atan2(targetPoint.x - hero.position.x, targetPoint.z - hero.position.z);
        hero.group.rotation.y = hero.targetRotation;
      }

      performHeroAttack();
    });

    window.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    // Virtual Joystick
    const joystickZone = document.getElementById('joystick-zone');
    const joystickBase = document.getElementById('joystick-base');
    const joystickKnob = document.getElementById('joystick-knob');
    let joystickActive = false;
    let joystickTouchId = null;
    let joystickOrigin = { x: 0, y: 0 };

    joystickZone.addEventListener('pointerdown', (e) => {
      sound.init();
      joystickActive = true;
      joystickTouchId = e.pointerId;
      const rect = joystickBase.getBoundingClientRect();
      joystickOrigin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      handleJoystickMove(e.clientX, e.clientY);
    });

    window.addEventListener('pointermove', (e) => {
      if (joystickActive && e.pointerId === joystickTouchId) handleJoystickMove(e.clientX, e.clientY);
    });

    const endJoystick = (e) => {
      if (joystickActive && (!e || e.pointerId === joystickTouchId)) {
        joystickActive = false;
        joystickTouchId = null;
        joystickKnob.style.transform = `translate(0px, 0px)`;
        hero.velocity.set(0, 0);
      }
    };
    window.addEventListener('pointerup', endJoystick);
    window.addEventListener('pointercancel', endJoystick);

    function handleJoystickMove(clientX, clientY) {
      const dx = clientX - joystickOrigin.x;
      const dy = clientY - joystickOrigin.y;
      const maxRadius = 45;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const normX = dist > 0 ? dx / dist : 0;
      const normY = dist > 0 ? dy / dist : 0;
      const clampedDist = Math.min(dist, maxRadius);

      joystickKnob.style.transform = `translate(${normX * clampedDist}px, ${normY * clampedDist}px)`;
      hero.velocity.set(normX * (clampedDist / maxRadius), normY * (clampedDist / maxRadius));
    }

    /* ==========================================================================
       14B. PLATFORM DETECTION & KEYBOARD / TOUCH CONTROLS
       ========================================================================== */
    function isMobileDevice() {
      const ua = (navigator.userAgent || navigator.vendor || window.opera || '').toLowerCase();
      const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|silk|kindle|fennec|maemo|touch/i;
      if (mobileRegex.test(ua)) return true;

      // iPadOS detection (iPadOS reports MacIntel with maxTouchPoints > 1)
      if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;

      // Touch capabilities & Coarse pointer
      const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0);
      const hasCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      if (hasTouch && hasCoarse) return true;

      // Screen size check for mobile/tablet devices
      if (hasTouch && (window.innerWidth <= 1024 || window.innerHeight <= 1024)) return true;

      return false;
    }

    function detectPlatform() {
      if (isMobileDevice() || (window.innerWidth <= 950 && window.innerHeight <= 520) || (window.innerHeight <= 450)) return 'mobile';
      return 'desktop';
    }

    state.platform = detectPlatform();
    document.body.classList.remove('platform-desktop', 'platform-mobile');
    document.body.classList.add(state.platform === 'desktop' ? 'platform-desktop' : 'platform-mobile');

    // Keyboard Controls (STRICTLY GATED TO DESKTOP PLAYERS - MOBILE USERS 100% BLOCKED)
    const keys = {};
    window.addEventListener('keydown', (e) => {
      // 1. ABSOLUTE BLOCK: Never let mobile users use keyboard shortcuts under any circumstance!
      if (state.platform === 'mobile' || isMobileDevice()) {
        return;
      }

      // 2. NEVER trigger shortcuts if typing inside ANY input, textarea, or contentEditable element
      const activeEl = document.activeElement;
      const isInputFocused = activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.isContentEditable ||
        activeEl.getAttribute('contenteditable') === 'true'
      );
      if (isInputFocused || (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA'))) {
        return;
      }

      sound.init();
      const k = e.key.toLowerCase();
      keys[k] = true;

      // Prevent holding-key repeat spam for discrete actions
      if (e.repeat && (e.key === ' ' || e.key === 'Shift' || k === 'h' || k === 'j' || k === 'k' || k === 'l' || k === 'c' || e.key === 'Escape')) {
        return;
      }

      // Escape key triggers exit confirmation (Single key: Escape)
      if (e.key === 'Escape') {
        e.preventDefault();
        if (state.phase === 'playing' || state.phase === 'refinery') {
          openExitConfirmModal();
        }
        return;
      }

      if (state.phase !== 'playing') return;

      // Primary Attack: Space key (and mouse clicking)
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        performHeroAttack();
      } else if (k === 'h' || e.key === 'Shift' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        // H (or Shift): Dash / Dodge
        e.preventDefault();
        performDash();
      } else if (k === 'j') {
        // J: Special Nova
        e.preventDefault();
        performSpecialNova();
      } else if (k === 'k') {
        // K: ULTIMATE (Celestial Overcharge)
        e.preventDefault();
        performUltimate();
      } else if (k === 'l' || k === 'b') {
        // L (or B): Recall / Open Refinery
        e.preventDefault();
        if (state.phase === 'refinery') {
          document.getElementById('refinery-modal').style.display = 'flex';
        } else {
          showLolBanner('RECALL CHANNELING', 'REFINERY FORGE OPENS AT WAVE END');
        }
      } else if (k === 'c' || k === 'f') {
        // C or F: Auto-Attack Toggle
        e.preventDefault();
        toggleAutoAttack();
      } else if (e.key === 'F1') {
        e.preventDefault();
        openShortcutsModal();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (state.platform === 'mobile' || isMobileDevice()) return;
      keys[e.key.toLowerCase()] = false;
    });

    function updateKeyboardMovement() {
      if (state.platform !== 'desktop' || isMobileDevice() || joystickActive || state.phase !== 'playing') return;
      let moveX = 0, moveZ = 0;
      if (keys['w'] || keys['arrowup']) moveZ -= 1;
      if (keys['s'] || keys['arrowdown']) moveZ += 1;
      if (keys['a'] || keys['arrowleft']) moveX -= 1;
      if (keys['d'] || keys['arrowright']) moveX += 1;

      if (moveX !== 0 || moveZ !== 0) {
        hero.moveTarget = null;
        const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
        hero.velocity.set(moveX / len, moveZ / len);
      } else if (!hero.moveTarget) {
        hero.velocity.set(0, 0);
      }
    }

    // Modal Action Buttons Manager & Mobile Synchronization
    function updateStartModalButtons() {
      const btnStart = document.getElementById('btn-start-game');
      const btnLaunch = document.getElementById('btn-host-launch');
      const btnReady = document.getElementById('btn-guest-ready');
      if (!btnStart) return;

      btnStart.classList.remove('ready-not-ready', 'ready-confirmed', 'launch-disabled');

      if (state.gameMode === 'solo') {
        btnStart.style.display = 'block'; // Single player uses the main Enter Arena button
        btnStart.textContent = '⚔️ ENTER ARENA';
        btnStart.disabled = false;
      } else {
        btnStart.style.display = 'none'; // In online co-op, hide bottom button to avoid duplicate launch/ready buttons!
        const isGuestTab = document.getElementById('btn-join-room-tab') && document.getElementById('btn-join-room-tab').classList.contains('active');
        if (isGuestTab) {
          const readyText = state.guestIsReady ? '🟢 SQUAD READY! (WAITING FOR HOST)' : '🔴 CLICK TO READY UP';
          if (btnReady) {
            btnReady.textContent = readyText;
            btnReady.style.display = 'block';
            if (state.guestIsReady) btnReady.classList.add('ready');
            else btnReady.classList.remove('ready');
          }
        } else {
          // Host view
          let allGuestsReady = true;
          let guestCount = 0;
          net.connections.forEach(g => {
            guestCount++;
            if (!g.isReady) allGuestsReady = false;
          });
          const canLaunch = !(guestCount > 0 && !allGuestsReady);
          const launchText = guestCount > 0 
            ? (canLaunch ? '🚀 LAUNCH SQUAD BATTLE (ALL READY)' : '⏳ WAITING FOR SQUAD TO READY UP...')
            : '🚀 LAUNCH SQUAD BATTLE';

          if (btnLaunch) {
            btnLaunch.disabled = !canLaunch;
            btnLaunch.textContent = launchText;
            if (canLaunch) btnLaunch.classList.add('all-ready');
            else btnLaunch.classList.remove('all-ready');
          }
        }
      }
    }
    window.updateStartModalButtons = updateStartModalButtons;

    function handleGuestReadyClick() {
      if (!validateUsername()) return;
      sound.playPickup();

      const code = roomInputEl ? roomInputEl.value.trim() : '';
      if (!net.conn || !net.conn.open) {
        if (code.length >= 1) {
          document.getElementById('guest-status-pill').textContent = '⏳ Connecting to squad...';
          state.guestIsReady = true;
          net.joinRoom(code);
        } else {
          document.getElementById('guest-status-pill').textContent = '⚠️ Enter room number above first!';
          if (roomInputEl) roomInputEl.focus();
          return;
        }
      } else {
        state.guestIsReady = !state.guestIsReady;
        net.send({
          type: 'GUEST_READY_TOGGLE',
          ready: state.guestIsReady,
          peerId: net.myId,
          username: state.username
        });
      }
      updateStartModalButtons();
    }

    function handleHostLaunchClick() {
      const btnHostLaunch = document.getElementById('btn-host-launch');
      if (btnHostLaunch && btnHostLaunch.disabled) return;
      if (!validateUsername()) return;

      if (state.platform === 'desktop' && !sessionStorage.getItem('broadroads_shortcuts_shown')) {
        sessionStorage.setItem('broadroads_shortcuts_shown', '1');
        pendingStartGame = true;
        openShortcutsModal();
        return;
      }

      net.broadcast({ type: 'START_GAME' });
      startMatchWithLoadingScreen(() => resetGame());
    }

    // Username Requirement & Fixed Summoner Identity (Locked - No Editing Allowed)
    const usernameAlert = document.getElementById('username-error-alert');

    function validateUsername() {
      if (!state.username || state.username.trim().length < 2) {
        state.username = localStorage.getItem('broadroads_username') || ('Commander_' + Math.floor(100 + Math.random() * 900));
        localStorage.setItem('broadroads_username', state.username);
      }
      const nameEl = document.getElementById('client-username-display');
      if (nameEl) nameEl.textContent = state.username.toUpperCase();
      const localNameEl = document.getElementById('local-hero-name');
      if (localNameEl) localNameEl.textContent = state.username.toUpperCase();
      if (hero && hero.nameplate) {
        hero.nameplate.update(state.username, state.hero.hp / state.hero.maxHp, state.hero.isDowned, net.isHost);
      }
      return true;
    }

    validateUsername();

    // Menu Mode & Class Selector Tabs (Safeguarded for Phased Client)
    const tabSolo = document.getElementById('tab-solo');
    if (tabSolo) {
      tabSolo.addEventListener('click', () => {
        sound.playPickup();
        state.gameMode = 'solo';
        tabSolo.classList.add('active');
        const tabMp = document.getElementById('tab-mp');
        if (tabMp) tabMp.classList.remove('active');
        const soloPanel = document.getElementById('solo-panel');
        if (soloPanel) soloPanel.style.display = 'flex';
        const mpPanel = document.getElementById('mp-panel');
        if (mpPanel) mpPanel.style.display = 'none';
        updateStartModalButtons();
      });
    }

    const tabMp = document.getElementById('tab-mp');
    if (tabMp) {
      tabMp.addEventListener('click', () => {
        if (!validateUsername()) return;
        sound.playPickup();
        state.gameMode = 'multiplayer';
        tabMp.classList.add('active');
        if (tabSolo) tabSolo.classList.remove('active');
        const soloPanel = document.getElementById('solo-panel');
        if (soloPanel) soloPanel.style.display = 'none';
        const mpPanel = document.getElementById('mp-panel');
        if (mpPanel) mpPanel.style.display = 'flex';
        if (!net.roomNumber) net.initHost();
        updateStartModalButtons();
      });
    }

    // Sub-mode toggle
    document.querySelectorAll('.sub-mode-card').forEach(card => {
      card.addEventListener('click', () => {
        sound.playPickup();
        document.querySelectorAll('.sub-mode-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        state.soloSubMode = card.dataset.sub;
      });
    });

    // Co-op Multiplayer Host / Join sub-tabs
    const btnHostRoom = document.getElementById('btn-host-room');
    if (btnHostRoom) {
      btnHostRoom.addEventListener('click', () => {
        if (!validateUsername()) return;
        sound.playPickup();
        btnHostRoom.classList.add('active');
        const joinTab = document.getElementById('btn-join-room-tab');
        if (joinTab) joinTab.classList.remove('active');
        const hostView = document.getElementById('host-view');
        if (hostView) hostView.style.display = 'block';
        const joinView = document.getElementById('join-view');
        if (joinView) joinView.style.display = 'none';
        if (!net.roomNumber) net.initHost('coop');
        updateStartModalButtons();
      });
    }

    const btnJoinRoomTab = document.getElementById('btn-join-room-tab');
    if (btnJoinRoomTab) {
      btnJoinRoomTab.addEventListener('click', () => {
        sound.playPickup();
        btnJoinRoomTab.classList.add('active');
        if (btnHostRoom) btnHostRoom.classList.remove('active');
        const hostView = document.getElementById('host-view');
        if (hostView) hostView.style.display = 'none';
        const joinView = document.getElementById('join-view');
        if (joinView) joinView.style.display = 'block';
        updateStartModalButtons();
      });
    }

    const btnCopyCode = document.getElementById('btn-copy-code');
    if (btnCopyCode) {
      btnCopyCode.addEventListener('click', () => {
        const code = net.roomNumber;
        if (code) {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(code).catch(() => {});
          }
          btnCopyCode.textContent = 'COPIED!';
          setTimeout(() => btnCopyCode.textContent = 'COPY', 1500);
        }
      });
    }

    // PvP Host / Join Sub-Tabs
    const btnPvPHostTab = document.getElementById('btn-pvp-host-tab');
    const btnPvPJoinTab = document.getElementById('btn-pvp-join-tab');
    const pvpHostView = document.getElementById('pvp-host-code-view');
    const pvpJoinView = document.getElementById('pvp-join-code-view');

    if (btnPvPHostTab && btnPvPJoinTab) {
      btnPvPHostTab.addEventListener('click', () => {
        sound.playPickup();
        btnPvPHostTab.classList.add('active');
        btnPvPJoinTab.classList.remove('active');
        if (pvpHostView) pvpHostView.style.display = 'block';
        if (pvpJoinView) pvpJoinView.style.display = 'none';
        if (!net.roomNumber) net.initHost('pvp');
      });

      btnPvPJoinTab.addEventListener('click', () => {
        sound.playPickup();
        btnPvPJoinTab.classList.add('active');
        btnPvPHostTab.classList.remove('active');
        if (pvpHostView) pvpHostView.style.display = 'none';
        if (pvpJoinView) pvpJoinView.style.display = 'block';
      });
    }

    // PvP Room Code Copy Button
    const btnPvPCopyCode = document.getElementById('btn-pvp-copy-code');
    if (btnPvPCopyCode) {
      btnPvPCopyCode.addEventListener('click', () => {
        sound.playPickup();
        if (!net.roomNumber) net.initHost('pvp');
        const code = net.roomNumber;
        if (code && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(code).catch(() => {});
        }
        btnPvPCopyCode.textContent = '✅ COPIED!';
        btnPvPCopyCode.classList.add('copied');
        setTimeout(() => {
          btnPvPCopyCode.textContent = '📋 COPY CODE';
          btnPvPCopyCode.classList.remove('copied');
        }, 1500);
      });
    }

    // PvP Direct Invite Link Copy Button
    const btnPvPCopyLink = document.getElementById('btn-pvp-copy-link');
    if (btnPvPCopyLink) {
      btnPvPCopyLink.addEventListener('click', () => {
        sound.playPickup();
        if (!net.roomNumber) net.initHost('pvp');
        const code = net.roomNumber;
        const link = `${window.location.origin}${window.location.pathname}?mode=pvp&room=${code}`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(link).catch(() => {});
        }
        btnPvPCopyLink.textContent = '✅ LINK COPIED!';
        btnPvPCopyLink.classList.add('copied');
        setTimeout(() => {
          btnPvPCopyLink.textContent = '🔗 COPY LINK';
          btnPvPCopyLink.classList.remove('copied');
        }, 1500);
      });
    }

    // PvP Open Invite Modal Button
    const btnOpenPvPInviteModal = document.getElementById('btn-pvp-open-invite-modal');
    if (btnOpenPvPInviteModal) {
      btnOpenPvPInviteModal.addEventListener('click', () => {
        if (typeof window.openPvPInviteModal === 'function') {
          window.openPvPInviteModal(state.pvp.playerTeam || 'blue', 0);
        }
      });
    }

    // PvP Modal Close Button
    const btnClosePvPInviteModal = document.getElementById('btn-close-pvp-invite-modal');
    const pvpInviteModal = document.getElementById('pvp-invite-code-modal');
    if (btnClosePvPInviteModal && pvpInviteModal) {
      btnClosePvPInviteModal.addEventListener('click', () => {
        sound.playPickup();
        pvpInviteModal.style.display = 'none';
      });
      pvpInviteModal.addEventListener('click', (e) => {
        if (e.target === pvpInviteModal) {
          pvpInviteModal.style.display = 'none';
        }
      });
    }

    // PvP Modal Copy Code & Copy Link Buttons
    const btnPvPModalCopyCode = document.getElementById('btn-pvp-modal-copy-code');
    if (btnPvPModalCopyCode) {
      btnPvPModalCopyCode.addEventListener('click', () => {
        sound.playPickup();
        const code = net.roomNumber;
        if (code && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(code).catch(() => {});
        }
        btnPvPModalCopyCode.textContent = '✅ COPIED!';
        setTimeout(() => btnPvPModalCopyCode.textContent = '📋 COPY CODE', 1500);
      });
    }

    const btnPvPModalCopyLink = document.getElementById('btn-pvp-modal-copy-link');
    if (btnPvPModalCopyLink) {
      btnPvPModalCopyLink.addEventListener('click', () => {
        sound.playPickup();
        const code = net.roomNumber;
        const link = `${window.location.origin}${window.location.pathname}?mode=pvp&room=${code}`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(link).catch(() => {});
        }
        btnPvPModalCopyLink.textContent = '✅ LINK COPIED!';
        setTimeout(() => btnPvPModalCopyLink.textContent = '🔗 COPY INVITE LINK', 1500);
      });
    }

    // PvP Quick Join Connect Button
    const pvpInputRoomCode = document.getElementById('pvp-input-room-code');
    if (pvpInputRoomCode) {
      pvpInputRoomCode.addEventListener('input', () => {
        pvpInputRoomCode.value = pvpInputRoomCode.value.replace(/[^0-9]/g, '');
      });
      pvpInputRoomCode.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const btn = document.getElementById('btn-pvp-connect-peer');
          if (btn) btn.click();
        }
      });
    }

    const btnPvPConnectPeer = document.getElementById('btn-pvp-connect-peer');
    if (btnPvPConnectPeer) {
      btnPvPConnectPeer.addEventListener('click', () => {
        if (!validateUsername()) return;
        const code = pvpInputRoomCode ? pvpInputRoomCode.value.trim() : '';
        if (code.length >= 1) {
          sound.init();
          state.gameMode = 'pvp';
          state.selectedMode = 'pvp';
          if (window.clientNav) window.clientNav.selectedMode = 'pvp';
          net.joinRoom(code);
        } else {
          const pill = document.getElementById('pvp-guest-status-pill');
          if (pill) pill.textContent = '⚠️ Please enter a PvP room number (e.g. 748201)';
        }
      });
    }

    // PvP Modal Direct Join Button
    const pvpModalInputCode = document.getElementById('pvp-modal-input-code');
    if (pvpModalInputCode) {
      pvpModalInputCode.addEventListener('input', () => {
        pvpModalInputCode.value = pvpModalInputCode.value.replace(/[^0-9]/g, '');
      });
      pvpModalInputCode.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const btn = document.getElementById('btn-pvp-modal-join-direct');
          if (btn) btn.click();
        }
      });
    }

    const btnPvPModalJoinDirect = document.getElementById('btn-pvp-modal-join-direct');
    if (btnPvPModalJoinDirect) {
      btnPvPModalJoinDirect.addEventListener('click', () => {
        if (!validateUsername()) return;
        const code = pvpModalInputCode ? pvpModalInputCode.value.trim() : '';
        if (code.length >= 1) {
          sound.init();
          state.gameMode = 'pvp';
          state.selectedMode = 'pvp';
          if (window.clientNav) window.clientNav.selectedMode = 'pvp';
          net.joinRoom(code);
          if (pvpInviteModal) pvpInviteModal.style.display = 'none';
        } else {
          const pill = document.getElementById('pvp-modal-status-pill');
          if (pill) pill.textContent = '⚠️ Please enter a room number (e.g. 748201)';
        }
      });
    }

    // Numeric Room Code Input (Co-op)
    const roomInputEl = document.getElementById('input-room-code');
    if (roomInputEl) {
      roomInputEl.addEventListener('input', () => {
        roomInputEl.value = roomInputEl.value.replace(/[^0-9]/g, '');
      });

      roomInputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const btn = document.getElementById('btn-connect-peer');
          if (btn) btn.click();
        }
      });
    }

    const btnConnectPeer = document.getElementById('btn-connect-peer');
    if (btnConnectPeer) {
      btnConnectPeer.addEventListener('click', () => {
        if (!validateUsername()) return;
        const code = roomInputEl ? roomInputEl.value.trim() : '';
        if (code.length >= 1) {
          sound.init();
          net.joinRoom(code);
        } else {
          const pill = document.getElementById('guest-status-pill');
          if (pill) pill.textContent = '⚠️ Please enter a room number (e.g. 748201)';
        }
        updateStartModalButtons();
      });
    }

    // Guest Ready Toggle Button
    const btnGuestReady = document.getElementById('btn-guest-ready');
    if (btnGuestReady) {
      btnGuestReady.addEventListener('click', handleGuestReadyClick);
    }

    // Host Launch Squad Battle Button
    const btnHostLaunch = document.getElementById('btn-host-launch');
    if (btnHostLaunch) {
      btnHostLaunch.addEventListener('click', handleHostLaunchClick);
    }

    // Auto-fill and connect from URL param ?room=123456 or ?mode=pvp&room=123456
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    const modeParam = urlParams.get('mode') || 'pvp';
    if (roomParam) {
      const cleanParam = roomParam.replace(/[^0-9]/g, '');
      if (cleanParam.length >= 1) {
        if (window.clientNav) {
          window.clientNav.selectMode(modeParam === 'coop' ? 'coop' : 'pvp');
          window.clientNav.showLobby();
        }
        const targetInput = document.getElementById(modeParam === 'coop' ? 'input-room-code' : 'pvp-input-room-code');
        if (targetInput) targetInput.value = cleanParam;
        setTimeout(() => {
          if (validateUsername() && window.net) {
            window.net.joinRoom(cleanParam);
          }
        }, 500);
      }
    }

    // Shortcuts Modal Handlers & Quick How To Play Dialog
    let pendingStartGame = false;
    const btnOpenShortcuts = document.getElementById('btn-open-shortcuts');
    if (btnOpenShortcuts) {
      btnOpenShortcuts.addEventListener('click', () => {
        sound.playPickup();
        pendingStartGame = false;
        openShortcutsModal();
      });
    }

    const btnCloseShortcuts = document.getElementById('btn-close-shortcuts');
    if (btnCloseShortcuts) {
      btnCloseShortcuts.addEventListener('click', () => {
        sound.playPickup();
        closeShortcutsModal();
        if (pendingStartGame) {
          pendingStartGame = false;
          if (state.gameMode === 'multiplayer' && net.isHost) {
            net.broadcast({ type: 'START_GAME' });
          }
          startMatchWithLoadingScreen(() => resetGame());
        }
      });
    }

    // Exit Game Modal Handlers
    const btnExitGame = document.getElementById('btn-exit-game');
    if (btnExitGame) {
      btnExitGame.addEventListener('click', () => {
        sound.playPickup();
        openExitConfirmModal();
      });
    }

    const btnCancelExit = document.getElementById('btn-cancel-exit');
    if (btnCancelExit) {
      btnCancelExit.addEventListener('click', () => {
        sound.playPickup();
        closeExitConfirmModal();
      });
    }

    const btnConfirmExit = document.getElementById('btn-confirm-exit');
    if (btnConfirmExit) {
      btnConfirmExit.addEventListener('click', () => {
        sound.playHit();
        executeExitMatch();
      });
    }

    // Squad Poll Vote Buttons
    const btnVoteEnd = document.getElementById('btn-vote-end');
    if (btnVoteEnd) {
      btnVoteEnd.addEventListener('click', () => {
        sound.playHit();
        castPollVote('end');
      });
    }

    const btnVoteContinue = document.getElementById('btn-vote-continue');
    if (btnVoteContinue) {
      btnVoteContinue.addEventListener('click', () => {
        sound.playPickup();
        castPollVote('continue');
      });
    }

    // Refinery Button Binds
    bindAction(document.getElementById('card-pyrite'), () => insertMaterialToCrucible('pyrite'));
    bindAction(document.getElementById('card-aether'), () => insertMaterialToCrucible('aether'));
    bindAction(document.getElementById('card-titanium'), () => insertMaterialToCrucible('titanium'));
    bindAction(document.getElementById('card-catalyst'), () => insertMaterialToCrucible('catalyst'));
    bindAction(document.getElementById('forge-slot-1'), () => clearCrucibleSlot(1));
    bindAction(document.getElementById('forge-slot-2'), () => clearCrucibleSlot(2));
    bindAction(document.getElementById('btn-do-forge'), executeForge);
    bindAction(document.getElementById('btn-quick-forge'), executeAutoForge);
    bindAction(document.getElementById('btn-next-wave'), () => startWave(state.currentWave + 1));

    // Start Game Button (Solo Mode & Multiplayer Squad Launch/Ready)
    bindAction(document.getElementById('btn-start-game'), () => {
      if (!validateUsername()) return;

      if (state.gameMode === 'solo') {
        if (state.platform === 'desktop' && !sessionStorage.getItem('broadroads_shortcuts_shown')) {
          sessionStorage.setItem('broadroads_shortcuts_shown', '1');
          pendingStartGame = true;
          openShortcutsModal();
          return;
        }
        startMatchWithLoadingScreen(() => resetGame());
      } else if (state.gameMode === 'multiplayer') {
        const isGuestTab = document.getElementById('btn-join-room-tab') && document.getElementById('btn-join-room-tab').classList.contains('active');
        if (isGuestTab) {
          handleGuestReadyClick();
        } else {
          handleHostLaunchClick();
        }
      }
    });

    bindAction(document.getElementById('btn-restart-game'), () => {
      if (!validateUsername()) return;
      startMatchWithLoadingScreen(() => resetGame());
    });

    bindAction(document.getElementById('btn-death-lobby'), () => {
      sound.playHit();
      returnToLobby();
    });

    // --------------------------------------------------------------------------
    // Mobile Landscape Orientation Controller
    // --------------------------------------------------------------------------
    function checkOrientation() {
      const isMobile = (state.platform === 'mobile' || isMobileDevice() || window.innerWidth <= 900);
      const isPortrait = window.innerHeight > window.innerWidth;
      const orientOverlay = document.getElementById('orientation-lock-screen');
      if (orientOverlay) {
        orientOverlay.style.display = (isMobile && isPortrait) ? 'flex' : 'none';
      }
    }

    // --------------------------------------------------------------------------
    // Landing Page & Game Wiki Codex Controller
    // --------------------------------------------------------------------------
    function initLandingAndWikiController() {
      const landingPage = document.getElementById('landing-page');
      const startModal = document.getElementById('start-modal');
      const wikiModal = document.getElementById('game-wiki-modal');

      function openLobby() {
        sound.init();
        sound.playPickup();
        if (landingPage) landingPage.style.display = 'none';
        if (startModal) startModal.style.display = 'flex';
        if (window.clientNav) {
          window.clientNav.showModeSelect();
          window.clientNav.updateUserDisplay();
        }
        if (screen.orientation && screen.orientation.lock) {
          screen.orientation.lock('landscape').catch(() => {});
        }
      }

      function openLanding() {
        sound.init();
        sound.playPickup();
        if (startModal) startModal.style.display = 'none';
        if (landingPage) landingPage.style.display = 'flex';
      }

      function openWiki(tabId = 'wiki-champions') {
        sound.init();
        sound.playPickup();
        if (wikiModal) {
          wikiModal.style.display = 'flex';
          switchWikiTab(tabId);
        }
      }

      function closeWiki() {
        sound.init();
        sound.playPickup();
        if (wikiModal) wikiModal.style.display = 'none';
      }

      function switchWikiTab(tabId) {
        document.querySelectorAll('.wiki-tab').forEach(t => {
          t.classList.toggle('active', t.dataset.tab === tabId);
        });
        document.querySelectorAll('.wiki-tab-panel').forEach(p => {
          p.classList.toggle('active', p.id === tabId);
        });
      }

      // Landing CTA triggers
      const btnLandingEnter = document.getElementById('btn-landing-enter');
      if (btnLandingEnter) btnLandingEnter.addEventListener('click', openLobby);
      const btnHeroPlay = document.getElementById('btn-hero-play');
      if (btnHeroPlay) btnHeroPlay.addEventListener('click', openLobby);

      // Wiki Triggers
      const btnLandingWiki = document.getElementById('btn-hero-wiki-open');
      if (btnLandingWiki) btnLandingWiki.addEventListener('click', () => openWiki('wiki-champions'));
      const navBtnWiki = document.getElementById('nav-btn-wiki');
      if (navBtnWiki) navBtnWiki.addEventListener('click', () => openWiki('wiki-champions'));
      const navBtnChamps = document.getElementById('nav-btn-champions');
      if (navBtnChamps) navBtnChamps.addEventListener('click', () => openWiki('wiki-champions'));
      const navBtnMins = document.getElementById('nav-btn-minerals');
      if (navBtnMins) navBtnMins.addEventListener('click', () => openWiki('wiki-minerals'));
      const navBtnBestiary = document.getElementById('nav-btn-bestiary');
      if (navBtnBestiary) navBtnBestiary.addEventListener('click', () => openWiki('wiki-bosses'));

      // Lobby navigation buttons
      const btnLobbyHome = document.getElementById('btn-lobby-home');
      if (btnLobbyHome) btnLobbyHome.addEventListener('click', openLanding);
      const btnClientNavWiki = document.getElementById('btn-client-nav-wiki');
      if (btnClientNavWiki) btnClientNavWiki.addEventListener('click', () => openWiki('wiki-champions'));
      const btnClientNavPlay = document.getElementById('btn-client-nav-play');
      if (btnClientNavPlay) btnClientNavPlay.addEventListener('click', openLobby);

      // Close Wiki button
      const btnCloseWiki = document.getElementById('btn-close-wiki');
      if (btnCloseWiki) btnCloseWiki.addEventListener('click', closeWiki);

      // Wiki Tab clicks
      document.querySelectorAll('.wiki-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          sound.playPickup();
          switchWikiTab(tab.dataset.tab);
        });
      });

      // Connect the in-match help button to open the Game Wiki!
      const btnLolHelp = document.getElementById('btn-lol-help');
      if (btnLolHelp) {
        btnLolHelp.addEventListener('click', (e) => {
          e.stopPropagation();
          openWiki('wiki-combat');
        });
      }

      // League Bottom Console direct click/tap triggers for abilities
      const btnQ = document.getElementById('btn-lol-q');
      if (btnQ) btnQ.addEventListener('pointerdown', (e) => { e.stopPropagation(); performHeroAttack(); });
      const btnW = document.getElementById('btn-lol-w');
      if (btnW) btnW.addEventListener('pointerdown', (e) => { e.stopPropagation(); performDash(); });
      const btnE = document.getElementById('btn-lol-e');
      if (btnE) btnE.addEventListener('pointerdown', (e) => { e.stopPropagation(); performSpecialNova(); });
      const btnR = document.getElementById('btn-lol-r');
      if (btnR) btnR.addEventListener('pointerdown', (e) => { e.stopPropagation(); performUltimate(); });
      const btnD = document.getElementById('btn-lol-d');
      if (btnD) btnD.addEventListener('pointerdown', (e) => { e.stopPropagation(); performDash(); });
      const btnF = document.getElementById('btn-lol-f');
      if (btnF) btnF.addEventListener('pointerdown', (e) => { e.stopPropagation(); toggleAutoAttack(); });
      const btnB = document.getElementById('btn-lol-b');
      if (btnB) btnB.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (state.phase === 'refinery') {
          document.getElementById('refinery-modal').style.display = 'flex';
        } else {
          showLolBanner('RECALL CHANNELING', 'REFINERY FORGE OPENS AT WAVE END');
        }
      });

      checkOrientation();
    }

    // Initialize Theme, Auth & Class Selection
    applyTheme(state.currentMonth);
    updateStartModalButtons();
    initLandingAndWikiController();
    authManager.init();

    // 1,000 Dungeons Flow Listeners
    const btnDungeonNext = document.getElementById('btn-dungeon-next');
    if (btnDungeonNext) {
      btnDungeonNext.addEventListener('click', () => {
        sound.playPickup();
        const clearModal = document.getElementById('dungeon-clear-modal');
        if (clearModal) clearModal.style.display = 'none';
        state.dungeonFloor++;
        authManager.saveProgress();
        startWave(state.dungeonFloor);
      });
    }

    const btnDungeonExit = document.getElementById('btn-dungeon-exit');
    if (btnDungeonExit) {
      btnDungeonExit.addEventListener('click', () => {
        sound.playHit();
        const clearModal = document.getElementById('dungeon-clear-modal');
        if (clearModal) clearModal.style.display = 'none';
        returnToLobby();
      });
    }

    const btnLvlContinue = document.getElementById('btn-levelup-continue');
    if (btnLvlContinue) {
      btnLvlContinue.addEventListener('click', () => {
        sound.playPickup();
        const lvlModal = document.getElementById('dungeon-levelup-modal');
        if (lvlModal) lvlModal.style.display = 'none';
        state.dungeonFloor++;
        authManager.saveProgress();
        startWave(state.dungeonFloor);
      });
    }

    const btnAscensionClose = document.getElementById('btn-ascension-close');
    if (btnAscensionClose) {
      btnAscensionClose.addEventListener('click', () => {
        sound.playPickup();
        const ascModal = document.getElementById('ascension-modal');
        if (ascModal) ascModal.style.display = 'none';
        returnToLobby();
      });
    }

    // Mobile Legends: Bang Bang Quick Signal Ping Binds
    const btnSigAtk = document.getElementById('btn-signal-attack');
    if (btnSigAtk) {
      btnSigAtk.addEventListener('click', (e) => {
        e.stopPropagation();
        sound.playFanfare();
        showLolBanner('⚔️ ATTACK COMMAND!', 'LAUNCH AN ATTACK!');
        if (hero) spawnClickRipple(hero.position.x, hero.position.z);
      });
    }

    const btnSigDef = document.getElementById('btn-signal-retreat');
    if (btnSigDef) {
      btnSigDef.addEventListener('click', (e) => {
        e.stopPropagation();
        sound.playHit();
        showLolBanner('🛡️ RETREAT PROTOCOL!', 'DEFEND THE CRUCIBLE ANVIL!');
      });
    }

    const btnMiniCenter = document.getElementById('btn-minimap-center');
    if (btnMiniCenter) {
      btnMiniCenter.addEventListener('click', (e) => {
        e.stopPropagation();
        sound.playPickup();
        if (hero && controls) controls.target.copy(hero.position);
      });
    }

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      checkOrientation();

      const newPlat = detectPlatform();
      if (newPlat !== state.platform) {
        state.platform = newPlat;
        document.body.classList.remove('platform-desktop', 'platform-mobile');
        document.body.classList.add(state.platform === 'desktop' ? 'platform-desktop' : 'platform-mobile');
        updateStartModalButtons();
      }
    });

    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        state.platform = detectPlatform();
        document.body.classList.remove('platform-desktop', 'platform-mobile');
        document.body.classList.add(state.platform === 'desktop' ? 'platform-desktop' : 'platform-mobile');
        updateStartModalButtons();
        checkOrientation();
      }, 200);
    });

export {
  bindAction, spawnClickRipple, handleJoystickMove, isMobileDevice,
  detectPlatform, updateKeyboardMovement, updateStartModalButtons,
  handleGuestReadyClick, handleHostLaunchClick, validateUsername,
  checkOrientation, initLandingAndWikiController
};
window.bindAction = bindAction;
window.spawnClickRipple = spawnClickRipple;
window.handleJoystickMove = handleJoystickMove;
window.isMobileDevice = isMobileDevice;
window.detectPlatform = detectPlatform;
window.updateKeyboardMovement = updateKeyboardMovement;
window.updateStartModalButtons = updateStartModalButtons;
window.handleGuestReadyClick = handleGuestReadyClick;
window.handleHostLaunchClick = handleHostLaunchClick;
window.validateUsername = validateUsername;
window.checkOrientation = checkOrientation;
window.initLandingAndWikiController = initLandingAndWikiController;

