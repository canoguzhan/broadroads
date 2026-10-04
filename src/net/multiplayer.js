/* PeerJS WebRTC Multiplayer Manager */
    function updateTeammatesHUD() {
      const container = document.getElementById('teammates-hud-container');
      if (!container) return;

      if (state.gameMode !== 'multiplayer' || remoteHeroes.size === 0) {
        container.innerHTML = '';
        return;
      }

      remoteHeroes.forEach((rh, peerId) => {
        let card = document.getElementById(`teammate-card-${peerId}`);
        if (!card) {
          card = document.createElement('div');
          card.id = `teammate-card-${peerId}`;
          card.className = 'hero-vitals teammate-vitals teammate-vitals-card';
          card.style.display = 'block';
          container.appendChild(card);
        }

        const pct = Math.max(0, Math.min(100, (rh.hp / rh.maxHp) * 100));
        card.innerHTML = `
          <div class="vitals-header">
            <span class="hero-name" style="color: var(--neon-cyan); font-size: 11px;">${rh.isHost ? '👑 ' : ''}${rh.username}</span>
            <span class="hero-level" style="font-size: 9px;">${rh.classId ? rh.classId.toUpperCase() : 'HERO'}</span>
          </div>
          <div class="bar-wrap">
            <div class="bar-label">
              <span>HP</span>
              <span>${rh.isDowned ? 'DOWNED!' : `${Math.round(pct)}%`}</span>
            </div>
            <div class="bar-bg">
              <div class="bar-fill hp-fill" style="width: ${pct}%; background: ${rh.isDowned ? '#ff0054' : ''};"></div>
            </div>
          </div>
        `;
      });
    }

    class NetworkManager {
      constructor() {
        this.peer = null;
        this.myId = '';
        this.isHost = false;
        this.roomNumber = '';
        this.connections = new Map(); // peerId -> { conn, username, heroClass, classData, hp, maxHp, isDowned }
        this.syncInterval = null;
        this.enemySyncInterval = null;
      }

      initHostRoom(mode = 'coop') {
        this.gameMode = mode;
        return this.initHost(mode);
      }

      initHost(mode = 'coop') {
        this.isHost = true;
        this.gameMode = mode || (state.gameMode === 'pvp' ? 'pvp' : 'coop');

        const updateElements = (code, live = false) => {
          const roomEl = document.getElementById('room-code-text');
          if (roomEl) roomEl.textContent = '#' + code;
          const pvpRoomEl = document.getElementById('pvp-room-code-text');
          if (pvpRoomEl) pvpRoomEl.textContent = '#' + code;
          const pvpModalRoomEl = document.getElementById('pvp-modal-room-code');
          if (pvpModalRoomEl) pvpModalRoomEl.textContent = '#' + code;

          const coopStatusEl = document.getElementById('host-status-pill');
          if (coopStatusEl) {
            coopStatusEl.textContent = live 
              ? `🟢 Room #${code} Live (${this.connections.size + 1}/4 Players). Ready to deploy!`
              : '⏳ Registering room number...';
          }
          const pvpStatusEl = document.getElementById('pvp-host-status-pill');
          if (pvpStatusEl) {
            pvpStatusEl.textContent = live
              ? `🟢 Live Room #${code} (${this.connections.size + 1}/10 Combatants). Ready!`
              : '⏳ Registering PvP arena room...';
          }
        };

        // If existing peer is active and connected, reuse it
        if (this.peer && !this.peer.destroyed && this.roomNumber) {
          updateElements(this.roomNumber, true);
          this.updateLobbyUI();
          return;
        }

        this.connections.clear();
        this.removeAllRemoteHeroes();

        // Generate clean random numeric room number (no limit to 4 digits, e.g. 6-digit default)
        const roomNum = Math.floor(100000 + Math.random() * 900000).toString();
        this.roomNumber = roomNum;
        const peerId = 'broadroads-room-' + roomNum;

        updateElements(roomNum, false);
        this.updateLobbyUI();

        try {
          if (this.peer) {
            try {
              this.peer.removeAllListeners();
              this.peer.destroy();
            } catch(e) {}
            this.peer = null;
          }
          this.peer = new Peer(peerId, { debug: 1 });

          this.peer.on('open', (id) => {
            this.myId = id;
            updateElements(roomNum, true);
            this.updateLobbyUI();
          });

          this.peer.on('connection', (conn) => {
            const maxConnections = (this.gameMode === 'pvp' || state.gameMode === 'pvp') ? 9 : 3;
            if (this.connections.size >= maxConnections) {
              conn.on('open', () => {
                conn.send({ type: 'LOBBY_FULL', message: `Room is full (maximum ${maxConnections + 1} players).` });
                setTimeout(() => conn.close(), 600);
              });
              return;
            }
            this.setupConnection(conn);
          });

          this.peer.on('disconnected', () => {
            if (this.peer && !this.peer.destroyed) {
              try { this.peer.reconnect(); } catch(e) {}
            }
          });

          this.peer.on('error', (err) => {
            const errType = err ? (err.type || err.message) : '';
            console.warn('Host Peer notification:', errType);
            if (errType === 'unavailable-id') {
              if (!this._retrying) {
                this._retrying = true;
                setTimeout(() => {
                  this._retrying = false;
                  this.roomNumber = '';
                  this.initHost();
                }, 1500);
              }
            } else if (errType === 'disconnected' || (typeof errType === 'string' && errType.includes('Lost connection'))) {
              if (this.peer && !this.peer.destroyed && !this.peer.disconnected) {
                try { this.peer.reconnect(); } catch(e) {}
              }
            }
          });
        } catch (e) {
          console.error(e);
        }
      }

      joinRoom(roomNum) {
        this.isHost = false;
        this.connections.clear();
        this.removeAllRemoteHeroes();

        const cleanNum = roomNum.toString().replace(/[^0-9]/g, '');
        if (!cleanNum) {
          const status = document.getElementById('guest-status-pill');
          if (status) status.textContent = '⚠️ Please enter a room number';
          const pvpStatus = document.getElementById('pvp-guest-status-pill');
          if (pvpStatus) pvpStatus.textContent = '⚠️ Please enter a room number';
          const pvpModalStatus = document.getElementById('pvp-modal-status-pill');
          if (pvpModalStatus) pvpModalStatus.textContent = '⚠️ Please enter a room number';
          return;
        }

        this.roomNumber = cleanNum;
        const hostPeerId = 'broadroads-room-' + cleanNum;
        const guestStatus = document.getElementById('guest-status-pill');
        if (guestStatus) guestStatus.textContent = `🔄 Connecting to room #${cleanNum}...`;
        const pvpStatus = document.getElementById('pvp-guest-status-pill');
        if (pvpStatus) pvpStatus.textContent = `🔄 Connecting to arena #${cleanNum}...`;
        const pvpModalStatus = document.getElementById('pvp-modal-status-pill');
        if (pvpModalStatus) pvpModalStatus.textContent = `🔄 Connecting to arena #${cleanNum}...`;

        try {
          if (this.peer) {
            try {
              this.peer.removeAllListeners();
              this.peer.destroy();
            } catch(e) {}
            this.peer = null;
          }
          this.peer = new Peer({ debug: 1 });

          this.peer.on('open', (myId) => {
            this.myId = myId;
            const conn = this.peer.connect(hostPeerId, { reliable: true });
            this.setupConnection(conn);
          });

          this.peer.on('disconnected', () => {
            if (this.peer && !this.peer.destroyed) {
              try { this.peer.reconnect(); } catch(e) {}
            }
          });

          this.peer.on('error', (err) => {
            const errType = err ? (err.type || err.message) : '';
            console.warn('Guest Peer notification:', errType);
            const status = document.getElementById('guest-status-pill');
            if (status) status.textContent = '❌ Failed to connect. Check room number.';
            const pvpStatus = document.getElementById('pvp-guest-status-pill');
            if (pvpStatus) pvpStatus.textContent = '❌ Failed to connect. Check room number.';
            const pvpModalStatus = document.getElementById('pvp-modal-status-pill');
            if (pvpModalStatus) pvpModalStatus.textContent = '❌ Failed to connect. Check room number.';
          });
        } catch (e) {
          console.error('Join error:', e);
        }
      }

      simulateAddGuest(username) {
        if (this.connections.size >= 3) return;
        const fakePeerId = 'sim_friend_' + username.toLowerCase().replace(/[^a-z0-9]/g, '_');
        this.connections.set(fakePeerId, {
          conn: { send: () => {} },
          username: username,
          heroClass: ['paladin', 'gunner', 'arcanist'][Math.floor(Math.random() * 3)],
          classData: null,
          hp: 140,
          maxHp: 140,
          isDowned: false,
          isReady: true
        });
        this.updateLobbyUI();
      }

      setupConnection(conn) {
        conn.on('open', () => {
          if (this.isHost) {
            // Register guest connection
            this.connections.set(conn.peer, {
              conn: conn,
              username: 'Squadmate',
              heroClass: 'paladin',
              classData: null,
              hp: 140,
              maxHp: 140,
              isDowned: false,
              isReady: false
            });

            // Send host info and season theme to guest
            conn.send({
              type: 'REQUEST_GUEST_INFO',
              month: state.currentMonth,
              hostUsername: state.username,
              hostClass: state.heroClass,
              hostClassData: state.activeClassData,
              gameMode: state.gameMode,
              roomNumber: this.roomNumber
            });

            if (state.gameMode === 'pvp' && window.pvpEngine) {
              const assignedTeam = (window.pvpEngine.redTeam.length <= window.pvpEngine.blueTeam.length) ? 'red' : 'blue';
              conn.send({
                type: 'PVP_INIT_SYNC',
                roomNumber: this.roomNumber,
                assignedTeam: assignedTeam,
                blueTeam: window.pvpEngine.blueTeam,
                redTeam: window.pvpEngine.redTeam
              });
            }

            this.updateLobbyUI();
            this.startSync();
          } else {
            // Guest sends credentials to host
            conn.send({
              type: 'GUEST_HANDSHAKE',
              username: state.username,
              heroClass: state.heroClass,
              classData: state.activeClassData
            });

            const guestPill = document.getElementById('guest-status-pill');
            if (guestPill) {
              guestPill.textContent = state.guestIsReady 
                ? '✅ Connected & Ready! Waiting for host to launch...' 
                : '✅ Connected to squad! Click Ready below.';
            }
            const pvpGuestPill = document.getElementById('pvp-guest-status-pill');
            if (pvpGuestPill) {
              pvpGuestPill.textContent = '✅ Connected to PvP Battleground! Ready to fight!';
            }
            const guestRoster = document.getElementById('guest-lobby-roster');
            if (guestRoster) guestRoster.style.display = 'flex';
            const guestReadyBtn = document.getElementById('btn-guest-ready');
            if (guestReadyBtn) {
              guestReadyBtn.style.display = 'block';
              if (state.guestIsReady) {
                guestReadyBtn.classList.add('ready');
                guestReadyBtn.textContent = '🟢 SQUAD READY! (WAITING FOR HOST)';
              } else {
                guestReadyBtn.classList.remove('ready');
                guestReadyBtn.textContent = '🔴 CLICK TO READY UP';
              }
            }
            if (state.guestIsReady) {
              conn.send({
                type: 'GUEST_READY_TOGGLE',
                ready: true,
                peerId: this.myId,
                username: state.username
              });
            }
            if (typeof updateStartModalButtons === 'function') updateStartModalButtons();
            this.startSync();
          }
        });

        conn.on('data', (packet) => {
          this.handlePacket(packet, conn);
        });

        conn.on('close', () => {
          if (this.isHost) {
            const guest = this.connections.get(conn.peer);
            const departedName = guest ? guest.username : 'Squadmate';
            this.connections.delete(conn.peer);

            if (state.phase === 'playing' || state.phase === 'refinery') {
              // Convert departed guest hero into autonomous AI Bot
              const rh = remoteHeroes.get(conn.peer);
              if (rh) {
                rh.isAI = true;
                rh.username = departedName + ' [AI]';
                if (rh.nameplate) rh.nameplate.update(rh.username, rh.hp / rh.maxHp, rh.isDowned, false);
              }
              this.broadcast({
                type: 'PLAYER_DEPARTED_AI',
                peerId: conn.peer,
                username: departedName
              });
              startSquadPollVote(departedName);
            } else {
              this.removeRemoteHero(conn.peer);
              this.broadcast({ type: 'PLAYER_LEFT', peerId: conn.peer });
            }
            this.updateLobbyUI();
            updateTeammatesHUD();
          } else {
            document.getElementById('guest-status-pill').textContent = '⚠️ Disconnected from host.';
            if (state.phase === 'playing' || state.phase === 'refinery') {
              startSquadPollVote('Host');
            } else {
              this.removeAllRemoteHeroes();
              updateTeammatesHUD();
            }
          }
        });
      }

      broadcast(packet, excludePeerId = null) {
        if (this.isHost) {
          this.connections.forEach((c, peerId) => {
            if (peerId !== excludePeerId && c.conn && c.conn.open) {
              c.conn.send(packet);
            }
          });
        } else {
          // Send to host
          if (this.peer && this.peer.connections) {
            for (let key in this.peer.connections) {
              this.peer.connections[key].forEach(c => {
                if (c.open) c.send(packet);
              });
            }
          }
        }
      }

      send(packet) {
        this.broadcast(packet);
      }

      startSync() {
        if (this.syncInterval) clearInterval(this.syncInterval);
        this.syncInterval = setInterval(() => this.syncLocalPlayer(), 40);

        if (this.isHost) {
          if (this.enemySyncInterval) clearInterval(this.enemySyncInterval);
          this.enemySyncInterval = setInterval(() => this.syncEnemiesAuthoritative(), 100);
        }
      }

      syncLocalPlayer() {
        if (state.phase !== 'playing') return;

        this.broadcast({
          type: 'PLAYER_SYNC',
          peerId: this.myId || 'host',
          username: state.username,
          x: hero.position.x,
          z: hero.position.z,
          rot: hero.group.rotation.y,
          vx: hero.velocity.x,
          vy: hero.velocity.y,
          hp: state.hero.hp,
          maxHp: state.hero.maxHp,
          shield: state.hero.shield,
          class: state.heroClass,
          classData: state.activeClassData,
          isDowned: state.hero.isDowned
        });
      }

      syncEnemiesAuthoritative() {
        if (!this.isHost || state.phase !== 'playing' || this.connections.size === 0) return;

        const enemyList = enemies.filter(e => !e.dead).map(e => ({
          id: e.id,
          type: e.type,
          x: e.position.x,
          z: e.position.z,
          hp: e.hp,
          maxHp: e.maxHp
        }));

        this.broadcast({
          type: 'ENEMY_SYNC',
          enemies: enemyList
        });
      }

      handlePacket(packet, senderConn) {
        if (!packet) return;

        if (packet.type === 'LOBBY_FULL') {
          document.getElementById('guest-status-pill').textContent = '❌ Room is full (maximum 4 players).';
          return;
        }

        if (packet.type === 'REQUEST_GUEST_INFO') {
          // Guest syncs active month theme with host
          if (packet.month !== undefined && packet.month !== state.currentMonth) {
            applyTheme(packet.month);
          }
          senderConn.send({
            type: 'GUEST_HANDSHAKE',
            username: state.username,
            heroClass: state.heroClass,
            classData: state.activeClassData
          });
          return;
        }

        if (packet.type === 'GUEST_HANDSHAKE') {
          if (this.isHost) {
            const guest = this.connections.get(senderConn.peer);
            if (guest) {
              guest.username = packet.username || 'Commander';
              guest.heroClass = packet.heroClass || 'paladin';
              guest.classData = packet.classData;
              guest.isReady = false;
            }
            if (state.gameMode === 'pvp' && window.pvpEngine) {
              const guestTeam = packet.team || ((window.pvpEngine.redTeam.length <= window.pvpEngine.blueTeam.length) ? 'red' : 'blue');
              window.pvpEngine.addPlayerToTeam(packet.username || 'Commander', guestTeam);
              this.broadcast({
                type: 'PVP_LOBBY_SYNC',
                blueTeam: window.pvpEngine.blueTeam,
                redTeam: window.pvpEngine.redTeam
              });
            }
            this.updateLobbyUI();

            // Broadcast complete roster to all guests
            this.broadcast({
              type: 'LOBBY_STATE_SYNC',
              players: this.getPlayerRoster(),
              month: state.currentMonth
            });
          }
          return;
        }

        if (packet.type === 'PVP_INIT_SYNC') {
          if (window.clientNav) {
            window.clientNav.selectMode('pvp');
            window.clientNav.showLobby();
          }
          if (window.pvpEngine) {
            state.pvp.playerTeam = packet.assignedTeam || 'red';
            state.hero.team = state.pvp.playerTeam;
            if (packet.blueTeam) window.pvpEngine.blueTeam = packet.blueTeam;
            if (packet.redTeam) window.pvpEngine.redTeam = packet.redTeam;
            window.pvpEngine.renderPvPLobbyUI();
          }
          const pvpGuestStatus = document.getElementById('pvp-guest-status-pill');
          if (pvpGuestStatus) pvpGuestStatus.textContent = `🟢 Connected to PvP Battleground (#${packet.roomNumber || this.roomNumber})! Team: ${state.pvp.playerTeam.toUpperCase()}`;
          const pvpModalStatus = document.getElementById('pvp-modal-status-pill');
          if (pvpModalStatus) pvpModalStatus.textContent = `🟢 Connected to PvP Battleground (#${packet.roomNumber || this.roomNumber})!`;
          return;
        }

        if (packet.type === 'PVP_LOBBY_SYNC') {
          if (window.pvpEngine) {
            if (packet.blueTeam) window.pvpEngine.blueTeam = packet.blueTeam;
            if (packet.redTeam) window.pvpEngine.redTeam = packet.redTeam;
            window.pvpEngine.renderPvPLobbyUI();
          }
          const pvpGuestStatus = document.getElementById('pvp-guest-status-pill');
          if (pvpGuestStatus) pvpGuestStatus.textContent = `🟢 Connected to PvP Battleground (#${this.roomNumber})!`;
          const pvpModalStatus = document.getElementById('pvp-modal-status-pill');
          if (pvpModalStatus) pvpModalStatus.textContent = `🟢 Connected to PvP Battleground (#${this.roomNumber})!`;
          return;
        }

        if (packet.type === 'GUEST_READY_TOGGLE') {
          if (this.isHost) {
            const guest = this.connections.get(packet.peerId || senderConn.peer);
            if (guest) {
              guest.isReady = !!packet.ready;
            }
            this.updateLobbyUI();
            this.broadcast({
              type: 'LOBBY_STATE_SYNC',
              players: this.getPlayerRoster(),
              month: state.currentMonth
            });
          }
          return;
        }

        if (packet.type === 'LOBBY_STATE_SYNC') {
          if (!this.isHost) {
            if (packet.month !== undefined && packet.month !== state.currentMonth) {
              applyTheme(packet.month);
            }
            this.renderRosterInElement('guest-lobby-roster', packet.players);
            document.getElementById('guest-lobby-roster').style.display = 'flex';
            const guestReadyBtn = document.getElementById('btn-guest-ready');
            if (guestReadyBtn) guestReadyBtn.style.display = 'block';
            document.getElementById('guest-status-pill').textContent = `🟢 Connected to squad (${packet.players.length}/4 Players). Waiting for host...`;
            if (typeof updateStartModalButtons === 'function') updateStartModalButtons();
          }
          return;
        }

        if (packet.type === 'START_GAME') {
          startMatchWithLoadingScreen(() => resetGame());
          return;
        }

        if (packet.type === 'GUEST_EXITED') {
          if (this.isHost) {
            const pId = packet.peerId || senderConn.peer;
            const departedName = packet.username || 'Squadmate';
            this.connections.delete(pId);
            if (state.phase === 'playing' || state.phase === 'refinery') {
              const rh = remoteHeroes.get(pId);
              if (rh) {
                rh.isAI = true;
                rh.username = departedName + ' [AI]';
                if (rh.nameplate) rh.nameplate.update(rh.username, rh.hp / rh.maxHp, rh.isDowned, false);
              }
              this.broadcast({
                type: 'PLAYER_DEPARTED_AI',
                peerId: pId,
                username: departedName
              }, pId);
              startSquadPollVote(departedName);
            } else {
              this.removeRemoteHero(pId);
              this.broadcast({ type: 'PLAYER_LEFT', peerId: pId }, pId);
            }
            this.updateLobbyUI();
            updateTeammatesHUD();
          }
          return;
        }

        if (packet.type === 'HOST_EXITED') {
          if (!this.isHost) {
            if (state.phase === 'playing' || state.phase === 'refinery') {
              startSquadPollVote(packet.username || 'Host');
            } else {
              returnToLobby();
            }
          }
          return;
        }

        if (packet.type === 'PLAYER_DEPARTED_AI') {
          if (!this.isHost) {
            const rh = remoteHeroes.get(packet.peerId);
            if (rh) {
              rh.isAI = true;
              rh.username = packet.username + ' [AI]';
              if (rh.nameplate) rh.nameplate.update(rh.username, rh.hp / rh.maxHp, rh.isDowned, false);
            }
            startSquadPollVote(packet.username);
            updateTeammatesHUD();
          }
          return;
        }

        if (packet.type === 'POLL_VOTE_START') {
          if (!this.isHost) {
            startSquadPollVote(packet.departedName, packet.totalHumans);
          }
          return;
        }

        if (packet.type === 'CAST_POLL_VOTE') {
          if (this.isHost) {
            recordPollVote(packet.voterId || senderConn.peer, packet.vote);
          }
          return;
        }

        if (packet.type === 'POLL_VOTE_TALLY') {
          updatePollTallyUI(packet.endCount, packet.continueCount, packet.totalHumans);
          return;
        }

        if (packet.type === 'POLL_VOTE_RESOLVED') {
          resolvePollVote(packet.decision, packet.endCount, packet.continueCount);
          return;
        }

        if (packet.type === 'PLAYER_SYNC') {
          const pId = packet.peerId || senderConn.peer;
          if (this.isHost) {
            packet.peerId = pId;
            this.broadcast(packet, senderConn.peer);
          }

          let rh = remoteHeroes.get(pId);
          if (!rh) {
            rh = new HeroEntity(true, pId, packet.username || 'Teammate', packet.class, packet.classData);
            rh.isHost = (pId === 'host' || pId.includes('room-'));
            rh.hp = packet.hp || 140;
            rh.maxHp = packet.maxHp || 140;
            rh.position.set(packet.x || 3, 0, packet.z || 0);
            remoteHeroes.set(pId, rh);
          }

          if (!rh.isAI) {
            rh.targetPos.set(packet.x, 0, packet.z);
            rh.targetRot = packet.rot;
            rh.hp = packet.hp;
            rh.maxHp = packet.maxHp;
            rh.isDowned = packet.isDowned;
          }
          if (rh.nameplate) {
            rh.nameplate.update(packet.username || rh.username, packet.hp / packet.maxHp, packet.isDowned, rh.isHost);
          }

          updateTeammatesHUD();
          checkCoopReviveState();
          return;
        }

        if (packet.type === 'ATTACK') {
          const pId = packet.peerId || senderConn.peer;
          if (this.isHost) {
            packet.peerId = pId;
            this.broadcast(packet, senderConn.peer);
          }

          const rh = remoteHeroes.get(pId);
          if (rh && !rh.isAI) {
            rh.triggerRemoteAttack(packet.facing, packet.combo, packet.class);
            const facingDir = new THREE.Vector3(packet.facing.x, 0, packet.facing.z).normalize();
            if (packet.class === 'paladin' || packet.class === 'melee') {
              spawnSlashWave(rh.position, facingDir, packet.combo, true);
            } else if (packet.class === 'gunner' || packet.class === 'ranged') {
              spawnGunnerBolts(rh.position, facingDir, true);
            } else if (packet.class === 'arcanist' || packet.class === 'magic') {
              spawnArcanistSpark(rh.position, facingDir, true);
            }
          }
          return;
        }

        if (packet.type === 'ENEMY_HIT') {
          if (this.isHost) {
            this.broadcast(packet, senderConn.peer);
          }

          let targetEnemy = enemies.find(e => e.id === packet.enemyId);
          if (!targetEnemy && packet.hitPos) {
            targetEnemy = enemies.find(e => !e.dead && e.position.distanceTo(packet.hitPos) < 2.5);
          }
          if (targetEnemy) {
            targetEnemy.applyRemoteHit(packet.damage, packet.isCrit, packet.attacker, packet.knockback);
          }
          return;
        }

        if (packet.type === 'SPECIAL') {
          const pId = packet.peerId || senderConn.peer;
          if (this.isHost) {
            packet.peerId = pId;
            this.broadcast(packet, senderConn.peer);
          }

          const rh = remoteHeroes.get(pId);
          if (rh && !rh.isAI) {
            rh.triggerRemoteSpecial(packet.pos);
          }
          return;
        }

        if (packet.type === 'REVIVE_EVENT') {
          if (this.isHost) {
            this.broadcast(packet, senderConn.peer);
          }

          if (packet.targetPeerId === this.myId || (!this.isHost && packet.targetPeerId === 'host')) {
            state.hero.isDowned = false;
            state.hero.hp = state.hero.maxHp * 0.5;
            state.hero.shield = state.hero.maxShield;
            sound.playReviveChime();
            updateVitalsHUD();
            document.getElementById('revive-banner').style.display = 'none';
          } else {
            const rh = remoteHeroes.get(packet.targetPeerId);
            if (rh) rh.isDowned = false;
          }
          updateTeammatesHUD();
          return;
        }

        if (packet.type === 'ENEMY_SYNC' && !this.isHost) {
          syncEnemiesFromHost(packet.enemies);
          return;
        }

        if (packet.type === 'PLAYER_LEFT') {
          this.removeRemoteHero(packet.peerId);
          updateTeammatesHUD();
          return;
        }
      }

      getPlayerRoster() {
        const roster = [{
          id: 'host',
          username: state.username,
          heroClass: state.heroClass,
          isHost: true,
          isReady: true
        }];

        this.connections.forEach((c, peerId) => {
          roster.push({
            id: peerId,
            username: c.username || 'Commander',
            heroClass: c.heroClass || 'paladin',
            isHost: false,
            isReady: !!c.isReady
          });
        });

        return roster;
      }

      updateLobbyUI() {
        const roster = this.getPlayerRoster();
        this.renderRosterInElement('host-lobby-roster', roster);
        const pill = document.getElementById('host-status-pill');
        if (pill) {
          pill.textContent = `🟢 Room #${this.roomNumber} Live (${roster.length}/4 Players).`;
        }

        const pvpPill = document.getElementById('pvp-host-status-pill');
        if (pvpPill) {
          const totalCombatants = this.connections.size + 1;
          pvpPill.textContent = `🟢 Live Room #${this.roomNumber} (${totalCombatants}/10 Combatants). Ready!`;
        }
        const pvpRoomEl = document.getElementById('pvp-room-code-text');
        if (pvpRoomEl && this.roomNumber) pvpRoomEl.textContent = '#' + this.roomNumber;
        const pvpModalRoomEl = document.getElementById('pvp-modal-room-code');
        if (pvpModalRoomEl && this.roomNumber) pvpModalRoomEl.textContent = '#' + this.roomNumber;

        // Host launch button state: only allow host to start, and only once everyone is ready
        let allGuestsReady = true;
        let guestCount = 0;
        this.connections.forEach(g => {
          guestCount++;
          if (!g.isReady) allGuestsReady = false;
        });

        const launchBtn = document.getElementById('btn-host-launch');
        if (launchBtn) {
          if (guestCount > 0 && !allGuestsReady) {
            launchBtn.disabled = true;
            launchBtn.classList.remove('all-ready');
            launchBtn.textContent = '⏳ WAITING FOR SQUAD TO READY UP...';
          } else {
            launchBtn.disabled = false;
            launchBtn.classList.add('all-ready');
            launchBtn.textContent = guestCount > 0 ? '🚀 LAUNCH SQUAD BATTLE (ALL READY)' : '🚀 LAUNCH SQUAD BATTLE';
          }
        }
      }

      renderRosterInElement(elementId, players) {
        const el = document.getElementById(elementId);
        if (!el) return;

        el.innerHTML = '';
        for (let i = 0; i < 4; i++) {
          const slot = document.createElement('div');
          const p = players[i];
          if (p) {
            slot.className = 'roster-slot active';
            const readyTag = p.isHost 
              ? '<span class="slot-ready-tag is-ready">HOST</span>' 
              : (p.isReady ? '<span class="slot-ready-tag is-ready">READY</span>' : '<span class="slot-ready-tag not-ready">NOT READY</span>');
            slot.innerHTML = `
              <div class="slot-player-info">
                <span>${p.isHost ? '👑' : '👤'}</span>
                <span>${p.username} ${p.isHost ? '(Host)' : ''}</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="slot-badge">${p.heroClass ? p.heroClass.toUpperCase() : 'WARRIOR'}</span>
                ${readyTag}
              </div>
            `;
          } else {
            slot.className = 'roster-slot empty';
            slot.innerHTML = `
              <div class="slot-player-info">
                <span>⏳</span>
                <span>Slot ${i + 1} - Waiting for player...</span>
              </div>
              <span style="font-size: 10px; color: var(--text-muted);">OPEN</span>
            `;
          }
          el.appendChild(slot);
        }
      }

      removeRemoteHero(peerId) {
        const rh = remoteHeroes.get(peerId);
        if (rh) {
          scene.remove(rh.group);
          remoteHeroes.delete(peerId);
        }
      }

      removeAllRemoteHeroes() {
        remoteHeroes.forEach(rh => scene.remove(rh.group));
        remoteHeroes.clear();
      }
    }

    window.net = new NetworkManager();

export { NetworkManager, updateTeammatesHUD };
window.NetworkManager = NetworkManager;
window.updateTeammatesHUD = updateTeammatesHUD;

