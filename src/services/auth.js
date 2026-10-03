/* NeonDB Authentication & Cloud Progression Engine */
const authManager = {
  activeTab: 'login',

  init() {
    const storedUser = localStorage.getItem('broadroads_user');
    if (storedUser) {
      try {
        state.accountUser = JSON.parse(storedUser);
        if (state.accountUser && state.accountUser.username) {
          state.username = state.accountUser.username;
        }
      } catch(e) {}
    }
    this.updateProfileUI();
    if (state.accountUser && state.accountUser.username) {
      this.loadProgress(state.accountUser.username);
    }
    this.bindEvents();
  },

  updateProfileUI() {
    const landingAuthBtn = document.getElementById('btn-landing-auth');
    const lobbyAuthBtn = document.getElementById('btn-lobby-auth');
    const levelBadge = document.getElementById('client-level-badge');
    const floorBadge = document.getElementById('dungeon-lobby-floor');
    const lvlBadge = document.getElementById('dungeon-lobby-lvl');
    const nameInput = document.getElementById('input-username');

    // Sanitize any corrupted cleared counts from previous loop bug
    if (state.totalDungeonsCleared > (state.dungeonFloor || 1) * 2) {
      state.totalDungeonsCleared = Math.max(0, (state.dungeonFloor || 1) - 1);
    }
    const currentLvl = Math.min(100, Math.max(1, Math.floor((state.totalDungeonsCleared || 0) / 10) + 1));
    state.dungeonLevel = currentLvl;
    localStorage.setItem('broadroads_dungeon_level', currentLvl);
    localStorage.setItem('broadroads_dungeons_cleared', state.totalDungeonsCleared);

    if (levelBadge) levelBadge.textContent = `LV. ${currentLvl}`;
    if (floorBadge) floorBadge.textContent = `FLOOR: ${state.dungeonFloor || 1} / 1000`;
    if (lvlBadge) lvlBadge.textContent = `LEVEL: ${currentLvl} / 100`;

    if (state.accountUser) {
      if (landingAuthBtn) landingAuthBtn.textContent = `👤 ${state.accountUser.username.toUpperCase()} (LV.${currentLvl})`;
      if (lobbyAuthBtn) lobbyAuthBtn.textContent = `🚪 LOGOUT (${state.accountUser.username.toUpperCase()})`;
      if (nameInput) {
        nameInput.value = state.accountUser.username;
        state.username = state.accountUser.username;
      }
    } else {
      if (landingAuthBtn) landingAuthBtn.textContent = `👤 LOGIN / REGISTER`;
      if (lobbyAuthBtn) lobbyAuthBtn.textContent = `🔐 SIGN IN`;
    }
  },

  handleLocalAuthFallback(cleanUser, password, mode) {
    try {
      const rawAccounts = localStorage.getItem('broadroads_local_accounts');
      const accounts = rawAccounts ? JSON.parse(rawAccounts) : {};

      if (mode === 'register') {
        if (accounts[cleanUser]) {
          this.showAlert('Username is already registered', 'error');
          return false;
        }
        accounts[cleanUser] = {
          username: cleanUser,
          password: password,
          created_at: new Date().toISOString()
        };
        localStorage.setItem('broadroads_local_accounts', JSON.stringify(accounts));
      } else {
        // Login mode
        if (accounts[cleanUser] && accounts[cleanUser].password !== password) {
          this.showAlert('Invalid username or password', 'error');
          return false;
        }
        if (!accounts[cleanUser]) {
          accounts[cleanUser] = {
            username: cleanUser,
            password: password,
            created_at: new Date().toISOString()
          };
          localStorage.setItem('broadroads_local_accounts', JSON.stringify(accounts));
        }
      }

      const userObj = { id: 'local_' + cleanUser, username: cleanUser, isLocal: true };
      state.accountUser = userObj;
      localStorage.setItem('broadroads_user', JSON.stringify(userObj));
      state.username = cleanUser;
      localStorage.setItem('broadroads_username', cleanUser);

      this.updateProfileUI();
      this.showAlert(mode === 'register' ? '🎉 Account created! Progress saved.' : '✨ Welcome back, Commander!', 'success');
      setTimeout(() => {
        this.closeModal();
        this.updateProfileUI();
      }, 900);
      return true;
    } catch (e) {
      console.error('Local auth fallback error:', e);
      this.showAlert('Authentication error', 'error');
      return false;
    }
  },

  async register(username, password) {
    const cleanUser = (username || '').trim().toLowerCase();
    if (!cleanUser || cleanUser.length < 3) {
      this.showAlert('Username must be at least 3 characters', 'error');
      return false;
    }
    if (!password || password.length < 4) {
      this.showAlert('Password must be at least 4 characters', 'error');
      return false;
    }

    this.showAlert('Connecting to NeonDB cloud...', 'info');
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanUser, password })
      });

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json') || res.status === 404) {
        console.warn(`Auth API endpoint unavailable (${res.status}). Switching to local storage fallback.`);
        return this.handleLocalAuthFallback(cleanUser, password, 'register');
      }

      const data = await res.json();
      if (!data.success) {
        this.showAlert(data.error || 'Registration failed', 'error');
        return false;
      }

      state.accountUser = data.user;
      localStorage.setItem('broadroads_user', JSON.stringify(data.user));
      state.username = data.user.username;
      localStorage.setItem('broadroads_username', data.user.username);

      if (data.progress) {
        this.applyProgress(data.progress);
      }

      this.showAlert('🎉 Account created! Cloud saving active.', 'success');
      setTimeout(() => {
        this.closeModal();
        this.updateProfileUI();
      }, 900);
      return true;
    } catch(err) {
      console.warn('Network error reaching NeonDB API, falling back to local account:', err);
      return this.handleLocalAuthFallback(cleanUser, password, 'register');
    }
  },

  async login(username, password) {
    const cleanUser = (username || '').trim().toLowerCase();
    if (!cleanUser || cleanUser.length < 3) {
      this.showAlert('Username must be at least 3 characters', 'error');
      return false;
    }
    if (!password || password.length < 4) {
      this.showAlert('Password must be at least 4 characters', 'error');
      return false;
    }

    this.showAlert('Authenticating with NeonDB...', 'info');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanUser, password })
      });

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json') || res.status === 404) {
        console.warn(`Auth API endpoint unavailable (${res.status}). Switching to local storage fallback.`);
        return this.handleLocalAuthFallback(cleanUser, password, 'login');
      }

      const data = await res.json();
      if (!data.success) {
        this.showAlert(data.error || 'Invalid credentials', 'error');
        return false;
      }

      state.accountUser = data.user;
      localStorage.setItem('broadroads_user', JSON.stringify(data.user));
      state.username = data.user.username;
      localStorage.setItem('broadroads_username', data.user.username);

      if (data.progress) {
        this.applyProgress(data.progress);
      }

      this.showAlert('✨ Welcome back, Commander!', 'success');
      setTimeout(() => {
        this.closeModal();
        this.updateProfileUI();
      }, 900);
      return true;
    } catch(err) {
      console.warn('Network error reaching NeonDB API, falling back to local account:', err);
      return this.handleLocalAuthFallback(cleanUser, password, 'login');
    }
  },

  async loadProgress(username) {
    if (!username) return;
    try {
      const res = await fetch(`/api/progress/load?username=${encodeURIComponent(username)}`);
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const data = await res.json();
        if (data.success && data.progress) {
          this.applyProgress(data.progress);
          this.updateProfileUI();
        }
      }
    } catch(err) {
      console.warn('Could not load progress from NeonDB, using local progress:', err);
    }
  },

  applyProgress(p) {
    if (p.dungeon_floor) state.dungeonFloor = parseInt(p.dungeon_floor, 10);
    if (p.total_dungeons_cleared !== undefined) state.totalDungeonsCleared = parseInt(p.total_dungeons_cleared, 10);
    if (state.totalDungeonsCleared > (state.dungeonFloor || 1) * 2) {
      state.totalDungeonsCleared = Math.max(0, (state.dungeonFloor || 1) - 1);
    }
    state.dungeonLevel = Math.min(100, Math.max(1, Math.floor((state.totalDungeonsCleared || 0) / 10) + 1));
    if (p.max_floor_reached) state.maxFloorReached = parseInt(p.max_floor_reached, 10);
    if (p.gold !== undefined) {
      const g = parseInt(p.gold, 10);
      const goldEl = document.getElementById('lol-gold-count');
      if (goldEl) goldEl.textContent = g;
    }

    localStorage.setItem('broadroads_dungeon_floor', state.dungeonFloor);
    localStorage.setItem('broadroads_dungeon_level', state.dungeonLevel);
    localStorage.setItem('broadroads_dungeons_cleared', state.totalDungeonsCleared);
    localStorage.setItem('broadroads_max_floor', state.maxFloorReached);
  },

  async saveProgress() {
    localStorage.setItem('broadroads_dungeon_floor', state.dungeonFloor);
    localStorage.setItem('broadroads_dungeon_level', state.dungeonLevel);
    localStorage.setItem('broadroads_dungeons_cleared', state.totalDungeonsCleared);
    localStorage.setItem('broadroads_max_floor', state.maxFloorReached);

    this.updateProfileUI();

    if (!state.accountUser || !state.accountUser.username) return;

    try {
      const goldAmount = parseInt(document.getElementById('lol-gold-count')?.textContent || '350', 10);
      const payload = {
        username: state.accountUser.username,
        dungeon_floor: state.dungeonFloor,
        dungeon_level: state.dungeonLevel,
        max_floor_reached: state.maxFloorReached,
        total_dungeons_cleared: state.totalDungeonsCleared,
        gold: goldAmount,
        materials: state.materials || {},
        equipped_gear: state.gear || {}
      };

      const res = await fetch('/api/progress/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const data = await res.json();
        if (data.success) {
          console.log('Progress successfully synced to NeonDB');
        }
      }
    } catch(err) {
      console.warn('NeonDB progress sync delayed / offline fallback active:', err);
    }
  },

  logout() {
    localStorage.removeItem('broadroads_user');
    state.accountUser = null;
    state.username = 'Commander_' + Math.floor(100 + Math.random() * 900);
    localStorage.setItem('broadroads_username', state.username);
    this.updateProfileUI();
    showLolBanner('LOGGED OUT', 'PLAYING IN GUEST MODE');
  },

  openModal(tab = 'login') {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    this.switchTab(tab);
    const alertBox = document.getElementById('auth-alert');
    if (alertBox) alertBox.style.display = 'none';
    const userInp = document.getElementById('auth-username');
    if (userInp) {
      userInp.value = state.accountUser ? state.accountUser.username : '';
      userInp.focus();
    }
    const passInp = document.getElementById('auth-password');
    if (passInp) passInp.value = '';
  },

  closeModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.style.display = 'none';
  },

  switchTab(tab) {
    this.activeTab = tab;
    const tabLogin = document.getElementById('tab-auth-login');
    const tabReg = document.getElementById('tab-auth-register');
    const submitBtn = document.getElementById('btn-auth-submit');
    const alertBox = document.getElementById('auth-alert');
    if (alertBox) alertBox.style.display = 'none';

    if (tab === 'login') {
      if (tabLogin) tabLogin.classList.add('active');
      if (tabReg) tabReg.classList.remove('active');
      if (submitBtn) submitBtn.textContent = '🔐 SIGN IN TO ARENA';
    } else {
      if (tabReg) tabReg.classList.add('active');
      if (tabLogin) tabLogin.classList.remove('active');
      if (submitBtn) submitBtn.textContent = '✨ CREATE ACCOUNT & SAVE PROGRESS';
    }
  },

  showAlert(msg, type = 'error') {
    const alertBox = document.getElementById('auth-alert');
    if (!alertBox) return;
    alertBox.textContent = msg;
    alertBox.className = `auth-alert ${type}`;
    alertBox.style.display = 'block';
  },

  bindEvents() {
    const landingBtn = document.getElementById('btn-landing-auth');
    if (landingBtn) landingBtn.addEventListener('click', () => {
      if (state.accountUser) this.logout();
      else this.openModal('login');
    });

    const lobbyBtn = document.getElementById('btn-lobby-auth');
    if (lobbyBtn) lobbyBtn.addEventListener('click', () => {
      if (state.accountUser) this.logout();
      else this.openModal('login');
    });

    const tabLogin = document.getElementById('tab-auth-login');
    if (tabLogin) tabLogin.addEventListener('click', () => this.switchTab('login'));

    const tabReg = document.getElementById('tab-auth-register');
    if (tabReg) tabReg.addEventListener('click', () => this.switchTab('register'));

    const closeBtn = document.getElementById('btn-auth-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this.closeModal());

    const guestBtn = document.getElementById('btn-auth-guest');
    if (guestBtn) guestBtn.addEventListener('click', () => {
      this.closeModal();
      showLolBanner('GUEST MODE ACTIVE', 'PROGRESS SAVED LOCALLY');
    });

    const form = document.getElementById('auth-form');
    if (form) form.addEventListener('submit', (e) => {
      e.preventDefault();
      const userInp = document.getElementById('auth-username');
      const passInp = document.getElementById('auth-password');
      const username = userInp ? userInp.value.trim() : '';
      const password = passInp ? passInp.value : '';

      if (!username || username.length < 2) {
        return this.showAlert('Username must be at least 2 characters');
      }
      if (!password || password.length < 4) {
        return this.showAlert('Password must be at least 4 characters');
      }

      if (this.activeTab === 'register') {
        this.register(username, password);
      } else {
        this.login(username, password);
      }
    });
  }
};

export { authManager };
window.authManager = authManager;
