/* Share links that open a replay at a moment: /?replay=<id>&t=<seconds>. */
export function replayLink(id, t = 0) {
  const url = new URL(location.origin + (import.meta.env.BASE_URL || '/'));
  url.searchParams.set('replay', id);
  if (t > 0) url.searchParams.set('t', String(Math.max(0, Math.floor(t))));
  return url.toString();
}

/** Uses the phone share sheet when available, otherwise copies the link. */
export async function share(ui, { id, t, text }) {
  const url = replayLink(id, t);
  const title = 'BroadRoads highlight';
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ title, text, url }); return; }
    await navigator.clipboard.writeText(url);
    ui.toast('Link copied: paste it anywhere to share this moment.', 'good', 3500);
  } catch {
    prompt('Copy this link:', url); // clipboard blocked (e.g. insecure context)
  }
}
