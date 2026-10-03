/* BROADROADS - Shared Engine Globals & Entity Registries */
window.hero = null;
window.net = null;
window.remoteHeroes = new Map();
window.enemies = [];
window.projectiles = [];
window.slashWaves = [];
window.gunnerRockets = [];
window.blackHoles = [];
window.shockwaves = [];
window.explosions = [];
window.droppedMaterials = [];
window.clickRipples = [];
window.pylonMeshes = [];
window.keys = {};
window.isPointerLocked = false;
window.pendingStartGame = false;
window.lastCountdownBeep = -1;
window.waveSpawnTimer = 0;
window.bannerTimeout = null;
window.joystickActive = false;
window.joystickTouchId = null;
window.joystickOrigin = { x: 0, y: 0 };

/* LoL & MLBB Announcement Banner Engine */
window.showLolBanner = function(mainText, subText = '') {
  const banner = document.getElementById('lol-announcement-banner');
  const mainEl = document.getElementById('lol-announce-main');
  const subEl = document.getElementById('lol-announce-sub');
  if (!banner || !mainEl) return;

  mainEl.textContent = mainText;
  if (subEl) subEl.textContent = subText;

  banner.classList.remove('active');
  void banner.offsetWidth; // trigger reflow
  banner.classList.add('active');

  if (window.bannerTimeout) clearTimeout(window.bannerTimeout);
  window.bannerTimeout = setTimeout(() => {
    banner.classList.remove('active');
  }, 3500);
};

/* Safe stubs for cross-module combat helpers */
window.triggerScreenShake = window.triggerScreenShake || function() {
  const el = document.body;
  if (!el) return;
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
  setTimeout(() => el.classList.remove('shake'), 260);
};

window.triggerAnvilFlash = window.triggerAnvilFlash || function() {
  const el = document.getElementById('anvil-flash');
  if (!el) return;
  el.style.opacity = '0.7';
  setTimeout(() => { el.style.opacity = '0'; }, 100);
};

window.spawnFloatingCombatText = window.spawnFloatingCombatText || function() {};
window.spawnMaterialDrops = window.spawnMaterialDrops || function() {};
window.spawnExplosion = window.spawnExplosion || function() {};
window.damagePlayer = window.damagePlayer || function() {};
window.updateSpecialButton = window.updateSpecialButton || function() {};

