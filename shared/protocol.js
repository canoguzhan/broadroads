/* Wire format helpers shared by the server and the browser.

   Snapshots ('s' messages) travel as one binary frame:
     u8 version | u32 jsonLength | JSON (everything except `u`) | u32 count | entries
   Each movement update entry is 14 bytes (16 for champions):
     u32 id (high bit set: an mp field follows) | u16 x*100 | u16 y*100 |
     u16 facing (0..2π scaled to 0..65535) | u16 hp | u16 flags | [u16 mp]
   compared with ~35 bytes of JSON per entry. */

const VERSION = 1;
const TAU = Math.PI * 2;
const enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const dec = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;
const u16 = v => Math.max(0, Math.min(65535, Math.round(v)));

export function encodeSnapshot(s) {
  const { u, ...rest } = s;
  const json = enc.encode(JSON.stringify(rest));
  const list = u || [];
  let size = 1 + 4 + json.length + 4;
  for (const e of list) size += e.length > 6 ? 16 : 14;
  const buf = new Uint8Array(size);
  const dv = new DataView(buf.buffer);
  let o = 0;
  dv.setUint8(o, VERSION); o += 1;
  dv.setUint32(o, json.length, true); o += 4;
  buf.set(json, o); o += json.length;
  dv.setUint32(o, list.length, true); o += 4;
  for (const e of list) {
    const hasMp = e.length > 6;
    dv.setUint32(o, (e[0] >>> 0) | (hasMp ? 0x80000000 : 0), true); o += 4;
    dv.setUint16(o, u16(e[1] * 100), true); o += 2;
    dv.setUint16(o, u16(e[2] * 100), true); o += 2;
    const f = ((e[3] % TAU) + TAU) % TAU;
    dv.setUint16(o, u16((f / TAU) * 65535), true); o += 2;
    dv.setUint16(o, u16(e[4]), true); o += 2;
    dv.setUint16(o, e[5] & 0xffff, true); o += 2;
    if (hasMp) { dv.setUint16(o, u16(e[6]), true); o += 2; }
  }
  return buf;
}

export function decodeSnapshot(data) {
  const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let o = 0;
  if (dv.getUint8(o) !== VERSION) throw new Error('unknown snapshot version');
  o += 1;
  const len = dv.getUint32(o, true); o += 4;
  const s = JSON.parse(dec.decode(buf.subarray(o, o + len))); o += len;
  const n = dv.getUint32(o, true); o += 4;
  if (n) {
    s.u = new Array(n);
    for (let i = 0; i < n; i++) {
      const raw = dv.getUint32(o, true); o += 4;
      const hasMp = (raw & 0x80000000) !== 0;
      const e = [raw & 0x7fffffff, dv.getUint16(o, true) / 100, dv.getUint16(o + 2, true) / 100, (dv.getUint16(o + 4, true) / 65535) * TAU, dv.getUint16(o + 6, true), dv.getUint16(o + 8, true)];
      o += 10;
      if (hasMp) { e.push(dv.getUint16(o, true)); o += 2; }
      s.u[i] = e;
    }
  }
  return s;
}

/** Self-state delta: only the fields that changed since the last send.
    `cache` (an object, mutated) remembers each field as JSON, because some
    fields are live references to server arrays (items, ranks). */
export function selfDelta(cache, next) {
  const out = { id: next.id };
  let changed = false;
  for (const k in next) {
    const v = next[k];
    if (v === undefined) continue;
    const j = typeof v === 'object' && v !== null ? JSON.stringify(v) : v;
    if (cache[k] === j) continue;
    cache[k] = j;
    out[k] = v;
    changed = true;
  }
  return changed ? out : null;
}
