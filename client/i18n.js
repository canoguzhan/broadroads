/* Interface languages. Text is written in English throughout the client;
   for another language, rendered text nodes and a few attributes are swapped
   for their translation as they appear (exact match on the English text, with
   leading icons/emoji kept, and {placeholders} for numbers and names).
   Anything inside [translate="no"] (chat, player names) is never touched.
   Missing translations simply stay English. */
export const LANGS = { en: 'English', tr: 'Türkçe', es: 'Español' };
const KEY = 'broadroads_lang';
const ATTRS = ['title', 'placeholder', 'aria-label'];

function initialLang() {
  try { const s = localStorage.getItem(KEY); if (s && LANGS[s]) return s; } catch { /* ignore */ }
  const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return LANGS[nav] ? nav : 'en';
}

export let lang = initialLang();
let exact = new Map();
let patterns = [];
const misses = new Set();

const PREFIX = /^([^\p{L}\p{N}]*)([\s\S]*?)([\s.…!?:]*)$/u;
const esc = s => s.replace(/[.*+?^$()|[\]\\]/g, '\\$&');

// {n} matches a number, {d} a division (II), {k} one key; any other name matches text.
const SLOT = { n: '[\\d.,/%+-]+s?', d: '[IVX]+', k: '\\S+' };

function compile(dict) {
  exact = new Map();
  patterns = [];
  for (const [en, tr] of Object.entries(dict)) {
    if (!tr) continue;
    if (/\{\w+\}/.test(en)) {
      const names = [];
      const re = new RegExp(`^${esc(en).replace(/\\?\{(\w+)\\?\}/g, (_, n) => { names.push(n); return `(${SLOT[n] || '.+?'})`; })}$`, 'u');
      patterns.push({ re, names, tr, weight: en.replace(/\{\w+\}/g, '').length });
    } else exact.set(en, tr);
  }
  patterns.sort((a, b) => b.weight - a.weight); // most specific first
}

function lookup(core) {
  const hit = exact.get(core);
  return hit === undefined ? null : hit;
}

function lookupPattern(core) {
  if (core.length >= 160) return null;
  for (const p of patterns) {
    const m = p.re.exec(core);
    if (m) return p.tr.replace(/\{(\w+)\}/g, (_, n) => { const v = m[p.names.indexOf(n) + 1] ?? ''; return translate(v) ?? v; });
  }
  return null;
}

/** Translates one English string (unchanged when there is no translation). */
export function t(text, vars) {
  if (vars) text = text.replace(/\{(\w+)\}/g, (_, n) => vars[n] ?? '');
  if (lang === 'en' || !text) return text;
  return translate(text) ?? text;
}

function translate(text) {
  const m = PREFIX.exec(text);
  if (!m || !m[2] || !/\p{L}/u.test(m[2])) return null;
  const whole = lookup(m[2] + m[3]);
  if (whole !== null) return m[1] + whole;
  const tr = lookup(m[2]);
  if (tr !== null) return m[1] + tr + m[3];
  // Joined strings: "A · B", "Name: description", "Q — Ability".
  for (const sep of [' · ', ': ', ' — ']) {
    const i = m[2].indexOf(sep);
    if (i < 0) continue;
    const a = m[2].slice(0, i), b = m[2].slice(i + sep.length);
    const ta = translate(a) ?? a, tb = translate(b) ?? b;
    if (ta !== a || tb !== b) return m[1] + ta + sep + tb + m[3];
  }
  const pt = lookupPattern(m[2]);
  if (pt !== null) return m[1] + pt + m[3];
  if (collect) misses.add(m[2]);
  return null;
}

const done = new WeakMap(); // text node -> the translation we wrote (never re-translated)
const skip = el => !el || el.closest('[translate="no"], script, style, kbd');

function translateNode(node) {
  if (node.nodeType === 3) {
    if (skip(node.parentElement)) return;
    const v = node.nodeValue;
    if (!v || v.length > 400 || done.get(node) === v || !/\p{L}/u.test(v)) return;
    const tr = translate(v.trim());
    if (tr !== null && tr !== v.trim()) { node.nodeValue = v.replace(v.trim(), tr); done.set(node, node.nodeValue); }
    return;
  }
  if (node.nodeType !== 1 || skip(node)) return;
  translateAttrs(node);
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === 3) translateNode(n);
    else if (!skip(n)) translateAttrs(n);
  }
}

// Writes only real changes: an identical write would still notify the observer and loop.
function translateAttrs(el, names = ATTRS) {
  for (const a of names) {
    const v = el.getAttribute(a);
    if (!v) continue;
    const tr = translate(v);
    if (tr !== null && tr !== v) el.setAttribute(a, tr);
  }
}

let collect = false;
/** Debug: window.__i18nMisses() lists English strings seen without a translation. */
if (typeof window !== 'undefined') window.__i18nMisses = () => [...misses];

/** Switches the active dictionary (also used by the tests). */
export function useDictionary(l, dict) { lang = l; compile(dict); }

export async function initI18n() {
  try { collect = new URLSearchParams(location.search).has('i18n-collect'); } catch { /* ignore */ }
  if (collect && lang === 'en') lang = 'tr';
  if (lang === 'en') return;
  const mod = lang === 'tr' ? await import('./i18n/tr.js') : await import('./i18n/es.js');
  useDictionary(lang, mod.default);
  document.documentElement.lang = lang;
  translateNode(document.body);
  document.title = t(document.title);
  new MutationObserver(records => {
    for (const r of records) {
      if (r.type === 'characterData') translateNode(r.target);
      else if (r.type === 'attributes') { if (!skip(r.target)) translateAttrs(r.target, [r.attributeName]); }
      else for (const n of r.addedNodes) translateNode(n);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

export function setLang(l) {
  if (!LANGS[l] || l === lang) return;
  try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
  location.reload();
}

/** A small language dropdown (labels stay in their own language). */
export function langPicker() {
  const sel = document.createElement('select');
  sel.className = 'lang-pick';
  sel.setAttribute('translate', 'no');
  sel.setAttribute('aria-label', 'Language');
  for (const [id, name] of Object.entries(LANGS)) sel.append(new Option(name, id, false, id === lang));
  sel.addEventListener('change', () => setLang(sel.value));
  return sel;
}
