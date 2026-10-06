/* Browser notifications while the tab is in the background: match found,
   party invites, friend requests, friends coming online, whispers.
   Permission is asked once, the first time the player queues for a game. */
const ICON = '/icon-192.png';
const supported = () => typeof Notification !== 'undefined';

export const notifyPermission = () => (supported() ? Notification.permission : 'unsupported');

export function askNotifyPermission() {
  if (!supported() || Notification.permission !== 'default') return;
  try { Notification.requestPermission(); } catch { /* old Safari: callback form only */ }
}

export function notify(title, body, tag) {
  if (!supported() || Notification.permission !== 'granted' || !document.hidden) return;
  try {
    const n = new Notification(title, { body, tag, icon: ICON, badge: ICON, renotify: !!tag });
    n.onclick = () => { window.focus(); n.close(); };
    setTimeout(() => n.close(), 15000);
  } catch {
    // Android Chrome only allows notifications through a service worker.
    navigator.serviceWorker?.ready.then(reg => reg.showNotification(title, { body, tag, icon: ICON })).catch(() => {});
  }
}
