/* Game portals (CrazyGames, Poki): when the game runs inside one (?portal=crazygames|poki, or
   the portal's domain), its SDK is loaded and told about loading, gameplay start/stop and ad
   breaks. Players there skip the landing page and play as a guest; external links are hidden
   (portal rules). Everything is a no-op outside a portal. */
import { sfx } from './audio/sfx.js';

const SDKS = {
  crazygames: {
    src: 'https://sdk.crazygames.com/crazygames-sdk-v3.js',
    init: async () => { await window.CrazyGames.SDK.init(); },
    loadingStop: () => window.CrazyGames.SDK.game.loadingStop(),
    gameplayStart: () => window.CrazyGames.SDK.game.gameplayStart(),
    gameplayStop: () => window.CrazyGames.SDK.game.gameplayStop(),
    ad: kind => new Promise(resolve => window.CrazyGames.SDK.ad.requestAd(kind === 'rewarded' ? 'rewarded' : 'midgame', {
      adStarted: () => mute(true), adFinished: () => { mute(false); resolve(true); }, adError: () => { mute(false); resolve(false); },
    })),
  },
  poki: {
    src: 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js',
    init: () => window.PokiSDK.init(),
    loadingStop: () => window.PokiSDK.gameLoadingFinished(),
    gameplayStart: () => window.PokiSDK.gameplayStart(),
    gameplayStop: () => window.PokiSDK.gameplayStop(),
    ad: async kind => { mute(true); try { return kind === 'rewarded' ? !!(await window.PokiSDK.rewardedBreak()) : (await window.PokiSDK.commercialBreak(), true); } finally { mute(false); } },
  },
};

function detect() {
  const q = new URLSearchParams(location.search).get('portal');
  if (q && SDKS[q]) return q;
  const ref = `${location.hostname} ${document.referrer}`;
  return /crazygames/.test(ref) ? 'crazygames' : /poki/.test(ref) ? 'poki' : null;
}

export const portal = detect();
let sdk = null, ready = false, inGameplay = false, lastAd = Date.now();
let savedVolume = null;
function mute(on) {
  if (on) { savedVolume = sfx.volume; sfx.setVolume(0); } else if (savedVolume !== null) { sfx.setVolume(savedVolume); savedVolume = null; }
}

export async function initPortal() {
  if (!portal) return;
  document.documentElement.classList.add('in-portal', `portal-${portal}`);
  try {
    await new Promise((ok, fail) => { const s = document.createElement('script'); s.src = SDKS[portal].src; s.onload = ok; s.onerror = fail; document.head.append(s); });
    await SDKS[portal].init();
    sdk = SDKS[portal]; ready = true;
  } catch (err) { console.warn('portal sdk', err); }
}

const call = (name, ...a) => { if (ready) { try { return sdk[name](...a); } catch (err) { console.warn('portal', name, err); } } return undefined; };
export const portalLoaded = () => call('loadingStop');
export function portalGameplay(on) { if (on === inGameplay) return; inGameplay = on; call(on ? 'gameplayStart' : 'gameplayStop'); }

/** An ad between matches, at most every 3 minutes. Resolves when the game can continue. */
export async function portalBreak() {
  if (!ready || Date.now() - lastAd < 180e3) return;
  lastAd = Date.now();
  await call('ad', 'midgame');
}

/** Rewarded ad; resolves true when the player watched it to the end. */
export async function portalRewarded() {
  if (!ready) return false;
  lastAd = Date.now();
  return !!(await call('ad', 'rewarded'));
}

export const portalAds = () => ready;
