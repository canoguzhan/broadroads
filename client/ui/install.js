/* Installable app: registers the service worker and offers an "Install app"
   button when the browser allows it (Chrome/Edge/Android). On iOS Safari,
   which has no install prompt, the button explains Share → Add to Home Screen. */
let deferred = null;
const listeners = new Set();
const changed = () => listeners.forEach(fn => fn());

export const isInstalled = () => matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;

/** True when an install button makes sense right now. */
export const canInstall = () => !isInstalled() && (!!deferred || isIos());
export const onInstallChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };

export function initPwa() {
  if ('serviceWorker' in navigator && !import.meta.env?.DEV && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker?.register('/sw.js').catch(() => {}));
  }
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; changed(); });
  window.addEventListener('appinstalled', () => { deferred = null; changed(); });
}

/** Shows the browser's install prompt (or iOS instructions via `explain`). */
export async function promptInstall(explain) {
  if (deferred) {
    deferred.prompt();
    await deferred.userChoice.catch(() => null);
    deferred = null;
    changed();
  } else if (isIos()) {
    explain('Tap the Share button in Safari, then “Add to Home Screen”, to install BroadRoads as an app.');
  }
}
