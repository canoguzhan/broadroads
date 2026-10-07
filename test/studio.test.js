import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findFights, pickFights, lineup } from '../server/studio/sim.js';
import { writeCommentary, schedule, spoken } from '../server/studio/commentary.js';
import { wordsFromAlignment, captionChunks } from '../server/studio/voice.js';
import { shortMeta, episodeMeta, tagList } from '../server/studio/metadata.js';
import { makeAuth } from '../server/studio/auth.js';
import { YouTube, isUploadLimit } from '../server/studio/youtube.js';
import { Episode, Pipeline } from '../server/studio/pipeline.js';
import { cleanSettings, DEFAULT_SETTINGS, startStudio } from '../server/studio/index.js';
import { Mix, thinSounds } from '../server/studio/mixer.js';
import { trCase, fill, EXTRA_LANGS } from '../server/studio/i18n.js';
import { toVtt, wrap, cuesFor } from '../server/studio/captions.js';
import { withMainUrl } from '../server/studio/metadata.js';

const hit = (t, s, v, n = 100, hp = 50) => ({ t, e: 'hit', s, v, n, hp, x: 50, y: 50 });
const kill = (t, k, v, team, a = []) => ({ t, e: 'kill', k, v, a, team });

function fixtureFight() {
  const events = [
    hit(100, 'garrok', 'lyra'), hit(101, 'lyra', 'garrok'), { t: 101.5, e: 'cast', c: 'garrok', sl: 'r', x: 50, y: 50 },
    kill(104, 'garrok', 'lyra', 'blue'), { t: 104, e: 'ann', key: 'first_strike', team: null, killer: 'garrok', victim: 'lyra' },
    hit(105, 'hale', 'garrok', 200, 8), kill(107, 'garrok', 'hale', 'blue', ['rook']),
    { t: 107, e: 'ann', key: 'multi2', team: null, killer: 'garrok', victim: 'hale' },
  ];
  return { n: 1, start: 96, end: 111, champs: ['garrok', 'lyra', 'hale', 'rook'], kills: 2, best: 'multi2', score: 12, events, before: { blue: 3, red: 4 }, replayEnd: 118, track: [] };
}

describe('fight detection', () => {
  test('clusters kills into fights with build-up and scores multi-kills higher', () => {
    const events = [hit(90, 'a', 'b'), kill(100, 'a', 'b', 'blue'), kill(105, 'a', 'c', 'blue'), { t: 105, e: 'ann', key: 'multi2' }, kill(300, 'd', 'e', 'red')];
    const fights = findFights(events, { duration: 600 });
    assert.equal(fights.length, 2);
    assert.equal(fights[0].kills, 2);
    assert.ok(fights[0].start < 100 && fights[0].start >= 100 - 8, 'keeps the build-up');
    assert.equal(fights[0].end, 109);
    assert.ok(fights[0].score > fights[1].score);
  });

  test('picks the best fights without overlaps, in match order', () => {
    const f = [{ start: 10, end: 40, score: 5 }, { start: 30, end: 60, score: 9 }, { start: 100, end: 130, score: 7 }, { start: 200, end: 205, score: 99 }];
    const picked = pickFights(f, 3);
    assert.deepEqual(picked.map(x => x.start), [30, 100]); // the 5 s one is too short, 10–40 overlaps 30–60
  });

  test('the lineup is deterministic per seed', () => {
    assert.deepEqual(lineup(42), lineup(42));
    assert.notDeepEqual(lineup(42).map(p => p.champ), lineup(43).map(p => p.champ));
    assert.equal(new Set(lineup(7).map(p => p.champ)).size, 10);
  });
});

describe('commentary', () => {
  test('writes an opener, kill calls, a multi-kill and a closer from the events', () => {
    const lines = writeCommentary(fixtureFight(), { summary: { seed: 1 } });
    const text = lines.map(l => spoken(l.text)).join(' | ');
    assert.ok(lines.every(l => /^\[[a-z ]+\] /.test(l.text)), 'every line has a delivery tag');
    assert.match(text, /Garrok/);
    assert.match(text, /Avalanche Charge/, 'calls the ultimate by name');
    assert.ok(lines.some(l => l.kind === 'multi'), 'the double replaces the plain kill line');
    assert.ok(lines.some(l => l.kind === 'close'));
    assert.deepEqual([...lines].sort((a, b) => a.at - b.at), lines);
  });

  test('schedule never overlaps lines and drops late low-priority ones', () => {
    const lines = [
      { at: 0, dur: 3, priority: 3, maxDelay: 1.5 },
      { at: 1, dur: 1, priority: 1, maxDelay: 0.8 }, // would start at 3.15: too late, dropped
      { at: 2.5, dur: 2, priority: 9, maxDelay: 1.2 }, // important: starts at 3.15
      { at: 20, dur: 5, priority: 5, maxDelay: 2 }, // past the end: dropped
    ];
    const kept = schedule(lines, { until: 22 });
    assert.equal(kept.length, 2);
    for (let i = 1; i < kept.length; i++) assert.ok(kept[i].start >= kept[i - 1].start + kept[i - 1].dur);
    assert.equal(kept[1].priority, 9);
  });

  test('a big moment replaces the line that would block it', () => {
    const kept = schedule([{ at: 0, dur: 4, priority: 2, maxDelay: 1 }, { at: 1, dur: 1, priority: 9, maxDelay: 0.5 }]);
    assert.deepEqual(kept.map(l => l.priority), [9]);
  });
});

describe('voice timing', () => {
  const al = s => ({ characters: [...s], character_start_times_seconds: [...s].map((_, i) => i * 0.1), character_end_times_seconds: [...s].map((_, i) => i * 0.1 + 0.1) });
  test('word timings skip delivery tags', () => {
    const w = wordsFromAlignment(al('[excited] Big play!'));
    assert.deepEqual(w.map(x => x.w), ['Big', 'play!']);
    assert.equal(w[0].s, 1);
  });
  test('captions are chunked, offset to match time and held between words', () => {
    const words = [{ w: 'One', s: 0, e: 0.3 }, { w: 'two,', s: 0.4, e: 0.7 }, { w: 'three', s: 0.8, e: 1 }, { w: 'four', s: 1.1, e: 1.3 }];
    const c = captionChunks(100, words, 3);
    assert.equal(c.length, 2); // breaks at the comma
    assert.equal(c[0].start, 100);
    assert.equal(c[0].end, 100.8 - 0.01);
    assert.equal(c[1].words[0].s, 100.8);
  });
});

describe('metadata', () => {
  test('short titles fit YouTube and are marked #Shorts; tags stay under 500 characters', () => {
    const m = shortMeta(fixtureFight(), { seed: 3 });
    assert.ok(m.title.length <= 100 && /#Shorts$/.test(m.title));
    assert.match(m.description, /broadroads\.com/);
    assert.match(m.description, /AI/);
    assert.ok(m.hook.length > 3);
    assert.ok(m.tags.join(',').length <= 500);
  });
  test('the episode description carries chapters starting at 0:00', () => {
    const f = fixtureFight();
    const summary = { seed: 1, duration: 1300, winner: 'blue', kills: { blue: 30, red: 20 }, players: lineup(1).map(p => ({ ...p, name: p.champ })) };
    const m = episodeMeta({ fights: [f], summary, seed: 1, chapters: [{ at: 0, label: 'Intro' }, { at: 5, label: 'Fight 1' }, { at: 40, label: 'Outro' }] });
    assert.match(m.description, /^0:00 Intro$/m);
    assert.match(m.description, /^0:05 Fight 1$/m);
    assert.ok(m.title.length <= 100);
  });
  test('tag lists drop duplicates and characters YouTube rejects', () => {
    const t = tagList(['a<b>', 'BROADROADS', ...Array.from({ length: 80 }, (_, i) => `long tag number ${i}`)]);
    assert.ok(!t.some(x => /[<>]/.test(x)));
    assert.equal(t.filter(x => x.toLowerCase() === 'broadroads').length, 1);
    assert.ok(t.join(',').length <= 500);
  });
});

describe('studio auth', () => {
  const req = (cookie, extra = {}) => ({ headers: { cookie, ...extra } });
  test('a session cookie is issued for the right token only and cannot be forged', () => {
    const a = makeAuth({ token: 'x'.repeat(20), secret: 's' });
    assert.equal(a.login('1.1.1.1', 'wrong').ok, false);
    const r = a.login('1.1.1.1', 'x'.repeat(20));
    assert.ok(r.ok);
    assert.match(r.cookie, /^__Host-studio=.+; Path=\/; HttpOnly; SameSite=Strict; Max-Age=\d+; Secure$/);
    const value = r.cookie.split(';')[0];
    assert.ok(a.session(req(value)));
    const [name, v] = value.split('=');
    const [payload, sig] = v.split('.');
    const forged = Buffer.from(JSON.stringify({ exp: Date.now() + 1e12, e: 1, n: 'x' })).toString('base64url');
    assert.equal(a.session(req(`${name}=${forged}.${sig}`)), null);
    assert.equal(a.session(req(`${name}=${payload}.AAAA`)), null);
    a.signOutEveryone();
    assert.equal(a.session(req(value)), null, 'sign out everywhere invalidates old cookies');
  });
  test('sessions expire', () => {
    let now = 1e12;
    const a = makeAuth({ token: 'y'.repeat(20), now: () => now });
    const c = a.login('ip', 'y'.repeat(20)).cookie.split(';')[0];
    now += 13 * 3600e3;
    assert.equal(a.session(req(c)), null);
  });
  test('failed logins are rate-limited per address', () => {
    const a = makeAuth({ token: 'z'.repeat(20) });
    for (let i = 0; i < 5; i++) assert.equal(a.login('9.9.9.9', 'nope').status, 401);
    const blocked = a.login('9.9.9.9', 'z'.repeat(20));
    assert.equal(blocked.status, 429, 'even the right token is refused while blocked');
    assert.ok(a.login('8.8.8.8', 'z'.repeat(20)).ok, 'other addresses are unaffected');
  });
  test('weak tokens are refused', () => assert.throws(() => makeAuth({ token: 'short' })));
  test('mutations need the studio header and a same-origin Origin', () => {
    const a = makeAuth({ token: 'q'.repeat(20) });
    assert.equal(a.sameOrigin({ headers: {} }, 'https://social.broadroads.com'), false);
    assert.equal(a.sameOrigin({ headers: { 'x-studio': '1', origin: 'https://evil.example' } }, 'https://social.broadroads.com'), false);
    assert.equal(a.sameOrigin({ headers: { 'x-studio': '1', origin: 'https://social.broadroads.com' } }, 'https://social.broadroads.com'), true);
  });
});

describe('settings', () => {
  test('values are clamped and unknown keys ignored', () => {
    const s = cleanSettings(DEFAULT_SETTINGS, { fights: 99, privacy: 'everyone', quality: 'high', voiceId: '../etc', evil: 1, autopilot: 1 });
    assert.equal(s.fights, 5);
    assert.equal(s.privacy, DEFAULT_SETTINGS.privacy);
    assert.equal(s.quality, 'high');
    assert.equal(s.voiceId, DEFAULT_SETTINGS.voiceId);
    assert.equal(s.autopilot, true);
    assert.equal(s.evil, undefined);
  });
});

describe('audio mix', () => {
  test('mixes, ducks and limits into a valid WAV', () => {
    const mix = new Mix(1);
    const tone = new Float32Array(48000 * 2).fill(0.9);
    mix.add(tone, 0, { bus: 'music', gain: 1 });
    mix.add(tone, 0.5, { bus: 'voice', gain: 1 });
    const wav = mix.master();
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.readUInt32LE(24), 48000);
    const peak = Math.max(...Array.from({ length: 1000 }, (_, i) => Math.abs(wav.readInt16LE(44 + (30000 + i) * 4))));
    assert.ok(peak < 32767, 'limited, not clipped');
  });
  test('thins out sound spam but keeps loud cues', () => {
    const sounds = Array.from({ length: 50 }, (_, i) => ({ t: 1 + i / 100, v: 0.1 })).concat([{ t: 1.5, v: 0.9 }, { t: 1.6, v: 0.01 }]);
    const kept = thinSounds(sounds);
    assert.ok(kept.length <= 15);
    assert.ok(kept.some(s => s.v === 0.9));
  });
});

describe('YouTube upload', () => {
  test('uploads with a resumable session and the right metadata', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-'));
    const video = path.join(dir, 'v.mp4');
    fs.writeFileSync(video, Buffer.alloc(1024, 1));
    const calls = [];
    const fakeFetch = async (url, opts = {}) => {
      calls.push({ url: String(url), opts });
      if (String(url).includes('oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'AT', expires_in: 3600, refresh_token: 'RT' }), { status: 200 });
      if (String(url).includes('/channels')) return new Response(JSON.stringify({ items: [{ id: 'UC1', snippet: { title: 'BroadRoads', thumbnails: {} } }] }), { status: 200 });
      if (String(url).includes('uploadType=resumable')) return new Response('', { status: 200, headers: { location: 'https://upload.example/session1' } });
      if (String(url) === 'https://upload.example/session1') {
        if (opts.body) for await (const _ of opts.body) { /* drain */ }
        return new Response(JSON.stringify({ id: 'VID123', status: { privacyStatus: 'unlisted' } }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    };
    const yt = new YouTube({ clientId: 'cid', clientSecret: 'cs', redirectUri: 'https://x/cb', tokenFile: path.join(dir, 'tok'), secret: 'sec', fetchImpl: fakeFetch });
    assert.ok(yt.authUrl('state1').includes('access_type=offline'));
    const ch = await yt.exchange('code');
    assert.equal(ch.title, 'BroadRoads');
    assert.ok(!fs.readFileSync(path.join(dir, 'tok'), 'utf8').includes('RT'), 'the refresh token is encrypted at rest');
    assert.equal(yt.connected, true);
    const r = await yt.upload(video, { title: 'T', description: 'D', tags: ['a'], privacy: 'unlisted' });
    assert.equal(r.id, 'VID123');
    const init = calls.find(c => c.url.includes('uploadType=resumable'));
    const body = JSON.parse(init.opts.body);
    assert.equal(body.snippet.categoryId, '20');
    assert.equal(body.status.privacyStatus, 'unlisted');
    assert.equal(body.status.selfDeclaredMadeForKids, false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('studio server', () => {
  let studio, base, dir;
  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-'));
    studio = await startStudio({ port: 0, dir, staticDir: path.resolve('public'), publicUrl: 'http://127.0.0.1', token: 'test-token-0123456789', secret: 'sec' });
    base = `http://127.0.0.1:${studio.port}`;
  });
  after(async () => { await studio.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const post = (p, body, headers = {}) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Studio': '1', ...headers }, body: JSON.stringify(body), redirect: 'manual' });

  test('everything but the login page needs a session', async () => {
    const page = await fetch(`${base}/`, { redirect: 'manual' });
    assert.equal(page.status, 302);
    assert.equal(page.headers.get('location'), '/login');
    assert.equal((await fetch(`${base}/api/state`)).status, 401);
    assert.equal((await fetch(`${base}/media/20261006-abcde/episode.mp4`)).status, 401);
    assert.equal((await fetch(`${base}/studio.js`, { redirect: 'manual' })).status, 302);
    const login = await fetch(`${base}/login`);
    assert.equal(login.status, 200);
    assert.match(login.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(login.headers.get('x-robots-tag'), 'noindex, nofollow');
  });

  test('login sets a session; mutations without the studio header are refused', async () => {
    assert.equal((await post('/api/login', { token: 'wrong-token-0123456789' })).status, 401);
    const ok = await post('/api/login', { token: 'test-token-0123456789' });
    assert.equal(ok.status, 200);
    const cookie = ok.headers.get('set-cookie').split(';')[0];
    const state = await fetch(`${base}/api/state`, { headers: { cookie } });
    assert.equal(state.status, 200);
    const j = await state.json();
    assert.equal(j.youtube.connected, false);
    assert.deepEqual(j.episodes, []);
    const csrf = await fetch(`${base}/api/settings`, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: '{"autopilot":true}' });
    assert.equal(csrf.status, 403);
    const s = await post('/api/settings', { fights: 2 }, { cookie });
    assert.equal((await s.json()).settings.fights, 2);
    assert.equal((await fetch(`${base}/media/..%2F..%2Fetc/passwd`, { headers: { cookie } })).status, 404);
    assert.equal((await fetch(`${base}/api/episodes/nope`, { headers: { cookie } })).status, 404);
  });

  test('the OAuth callback rejects a missing or forged state', async () => {
    const r = await fetch(`${base}/oauth/youtube/callback?code=x&state=y`, { redirect: 'manual' });
    assert.equal(r.status, 200);
    assert.match(await r.text(), /youtube=state/);
  });
});

describe('YouTube upload limit', () => {
  const limitErr = () => Object.assign(new Error('YouTube upload refused: 400 The user has exceeded the number of videos they may upload.'), { reason: 'uploadLimitExceeded' });
  function setup({ failOn = 1, blocked = null } = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eps-'));
    const ep = Episode.create(root, { privacy: 'private' });
    Object.assign(ep.data, { edited: true, main: { file: 'episode.mp4', thumb: 'thumb.jpg', meta: { title: 'T', description: 'D', tags: [] } },
      fights: [1, 2, 3].map(n => ({ n, short: { file: `short${n}.mp4`, meta: { title: `S${n}`, description: 'Play BroadRoads free', tags: [] } } })) });
    ep.save();
    let calls = 0;
    const youtube = { connected: true, async upload() { calls++; if (calls >= failOn) throw limitErr(); return { id: `V${calls}`, url: `https://youtu.be/V${calls}`, status: { privacyStatus: 'private' } }; }, async thumbnail() {} };
    const hits = [];
    const uploadGate = { check: () => blocked, pausedUntil: () => Date.now() + 3600e3, limitHit: e => hits.push(e) };
    const pipe = new Pipeline({ root, staticDir: path.resolve('public'), host: null, voiceCache: root, musicDir: root, youtube, env: {}, uploadGate });
    return { ep, pipe, hits, calls: () => calls, root };
  }

  test('recognizes the channel limit and quota errors', () => {
    assert.ok(isUploadLimit(limitErr()));
    assert.ok(isUploadLimit({ reason: 'quotaExceeded', message: '' }));
    assert.ok(!isUploadLimit(new Error('YouTube upload refused: 400 Invalid title')));
  });

  test('a refusal parks the episode as waiting instead of failing it', async () => {
    const t = setup({ failOn: 1 });
    await t.pipe.upload(t.ep, null);
    assert.equal(t.ep.data.status, 'waiting');
    assert.match(t.ep.data.error, /uploads automatically/);
    assert.equal(t.hits.length, 1, 'the studio is told to pause uploads');
    fs.rmSync(t.root, { recursive: true, force: true });
  });

  test('uploads made before the limit are kept and not repeated', async () => {
    const t = setup({ failOn: 3 }); // episode + short 1 go up, short 2 is refused
    await t.pipe.upload(t.ep, null);
    assert.equal(t.ep.data.status, 'waiting');
    assert.ok(t.ep.data.uploads.main);
    assert.deepEqual(Object.keys(t.ep.data.uploads.shorts), ['1']);
  });

  test('a spent daily budget waits without calling YouTube at all', async () => {
    const t = setup({ blocked: 'Upload budget used up' });
    await t.pipe.upload(t.ep, null);
    assert.equal(t.calls(), 0);
    assert.equal(t.ep.data.status, 'waiting');
    assert.equal(t.hits.length, 0);
  });

  test('the daily budget setting is bounded', () => {
    assert.equal(cleanSettings(DEFAULT_SETTINGS, { maxUploadsPerDay: 0 }).maxUploadsPerDay, 1);
    assert.equal(cleanSettings(DEFAULT_SETTINGS, { maxUploadsPerDay: 6 }).maxUploadsPerDay, 6);
  });
});

describe('languages', () => {
  const LANGS4 = ['es', 'pt', 'tr', 'id'];
  test('every commentary line comes with its translations', () => {
    const lines = writeCommentary(fixtureFight(), { summary: { seed: 7 } });
    for (const l of lines) {
      for (const g of LANGS4) {
        assert.ok(l.i18n[g] && l.i18n[g].length > 3, `${l.kind} has ${g}`);
        assert.ok(!/[{}[\]]/.test(l.i18n[g]), `no placeholders or tags: ${l.i18n[g]}`);
      }
    }
    const open = lines.find(l => l.kind === 'open');
    assert.ok(/Red|Blue|dead even/.test(spoken(open.text)) || /Garrok|Lyra/.test(open.text));
  });

  test('Turkish case endings follow vowel harmony (and how names are said)', () => {
    assert.equal(trCase.acc('Garrok'), "Garrok'u");
    assert.equal(trCase.acc('Lyra'), "Lyra'yı");
    assert.equal(trCase.gen('Kaelen'), "Kaelen'in");
    assert.equal(trCase.dat('Rook'), "Rook'a");
    assert.equal(trCase.acc('Thorne'), "Thorne'u");
    assert.equal(fill('{k}, {v|acc} indiriyor!', { k: 'Garrok', v: 'Lyra' }, 'tr'), "Garrok, Lyra'yı indiriyor!");
    assert.equal(fill('{m|lower|cap}', { m: 'TAKIM SİLİNDİ' }, 'tr'), 'Takım silindi');
  });

  test('shorts and episodes get titles and descriptions in every language', () => {
    const f = fixtureFight();
    const m = shortMeta(f, { seed: 3, langs: LANGS4 });
    assert.deepEqual(Object.keys(m.localizations).sort(), [...LANGS4].sort());
    for (const [g, loc] of Object.entries(m.localizations)) {
      assert.ok(loc.title.length <= 100 && /#Shorts$/.test(loc.title), g);
      assert.match(loc.description, /broadroads\.com/);
      assert.ok(!/[{}<>]/.test(loc.title + loc.description), g);
    }
    const summary = { seed: 1, duration: 1300, winner: 'blue', kills: { blue: 30, red: 20 }, players: lineup(1).map(p => ({ ...p, name: p.champ })) };
    const e = episodeMeta({ fights: [f], summary, seed: 1, langs: LANGS4, chapters: [{ at: 0, kind: 'intro' }, { at: 5, kind: 'fight', n: 1 }, { at: 40, kind: 'outro' }] });
    assert.match(e.description, /^0:05 Fight 1 — Garrok: /m);
    assert.match(e.localizations.tr.description, /^0:00 Giriş$/m);
    assert.match(e.localizations.es.description, /^0:05 Pelea 1: Garrok, /m);
    assert.match(e.localizations.pt.description, /Vermelho: /);
  });

  test('the full-match link is added in the description language', () => {
    assert.match(withMainUrl('Line one\nLine two', 'es', 'https://youtu.be/X'), /^Line one\nPartida completa: https:\/\/youtu\.be\/X\nLine two$/);
    assert.equal(withMainUrl('a https://youtu.be/X', 'es', 'https://youtu.be/X'), 'a https://youtu.be/X');
  });

  test('captions are valid WebVTT with short rows', () => {
    const vtt = toVtt([{ start: 1.5, end: 4, text: 'Short line' }, { start: 65, end: 71, text: 'A much longer caption line that has to wrap onto more than two rows of text to fit the screen nicely' }]);
    assert.match(vtt, /^WEBVTT\n\n00:00:01\.500 --> 00:00:04\.000\nShort line\n/);
    assert.match(vtt, /00:01:05\.000 --> /);
    for (const row of vtt.split('\n')) if (!row.includes('-->')) assert.ok(row.length <= 42, row);
    assert.ok(wrap('one two three', 7).length === 2);
    const cues = cuesFor([{ text: '[excited] Big play!', i18n: { es: '¡Jugadón!' }, start: 10, dur: 2 }], 'es', l => l.start - 9);
    assert.deepEqual(cues, [{ start: 1, end: 3, text: '¡Jugadón!' }]);
    assert.equal(cuesFor([{ text: '[excited] Big play!', start: 10, dur: 2 }], 'tr', l => l.start)[0].text, 'Big play!', 'falls back to English');
  });

  test('language settings only keep supported languages', () => {
    const s = cleanSettings(DEFAULT_SETTINGS, { languages: ['es', 'xx', 'tr', 'es', 'en'], captionsFor: 'all' });
    assert.deepEqual(s.languages, ['es', 'tr']);
    assert.equal(s.captionsFor, 'all');
    assert.equal(cleanSettings(DEFAULT_SETTINGS, { captionsFor: 'bogus' }).captionsFor, DEFAULT_SETTINGS.captionsFor);
    assert.deepEqual(DEFAULT_SETTINGS.languages, EXTRA_LANGS);
  });

  test('uploads carry localizations; captions need the extra permission and go up once', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-'));
    const ep = Episode.create(root, { privacy: 'private', languages: ['es', 'tr'], captionsFor: 'episode' });
    fs.writeFileSync(ep.file('episode.en.vtt'), 'WEBVTT\n'); fs.writeFileSync(ep.file('episode.es.vtt'), 'WEBVTT\n'); fs.writeFileSync(ep.file('episode.tr.vtt'), 'WEBVTT\n');
    Object.assign(ep.data, { edited: true, main: { file: 'episode.mp4', thumb: 'thumb.jpg', meta: { title: 'T', description: 'D', tags: [], localizations: { es: { title: 'T-es', description: 'D-es' }, tr: { title: 'T-tr', description: 'D-tr' }, pt: { title: 'not chosen', description: '' } } } },
      fights: [], captions: { main: { en: 'episode.en.vtt', es: 'episode.es.vtt', tr: 'episode.tr.vtt' }, shorts: {} } });
    ep.save();
    const sent = [], caps = [];
    let canCaption = false;
    const youtube = { connected: true, get canCaption() { return canCaption; }, async upload(file, meta) { sent.push(meta); return { id: 'VID', url: 'https://youtu.be/VID', status: {} }; }, async thumbnail() {}, async caption(id, lang) { caps.push(`${id}:${lang}`); } };
    const pipe = new Pipeline({ root, staticDir: path.resolve('public'), host: null, voiceCache: root, musicDir: root, youtube, env: {}, uploadGate: { check: () => null, pausedUntil: () => null, limitHit() {} } });
    await pipe.upload(ep, null);
    assert.deepEqual(Object.keys(sent[0].localizations).sort(), ['es', 'tr'], 'only chosen languages, keyed by YouTube codes');
    assert.equal(caps.length, 0, 'no captions without the permission');
    assert.ok(ep.data.log.some(l => /reconnect YouTube/.test(l.msg)));
    canCaption = true;
    await pipe.upload(ep, null);
    assert.deepEqual(caps.sort(), ['VID:en', 'VID:es', 'VID:tr']);
    assert.equal(sent.length, 1, 'the video itself is not uploaded again');
    await pipe.upload(ep, null);
    assert.equal(caps.length, 3, 'tracks already on YouTube are skipped');
    assert.equal(ep.data.status, 'published');
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('the YouTube client sends localizations and caption tracks', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yt2-'));
    fs.writeFileSync(path.join(dir, 'v.mp4'), Buffer.alloc(64, 1));
    const calls = [];
    const fakeFetch = async (url, opts = {}) => {
      calls.push({ url: String(url), opts });
      if (String(url).includes('oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'AT', expires_in: 3600, refresh_token: 'RT', scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.force-ssl' }), { status: 200 });
      if (String(url).includes('/channels')) return new Response(JSON.stringify({ items: [] }), { status: 200 });
      if (String(url).includes('uploadType=resumable')) return new Response('', { status: 200, headers: { location: 'https://upload.example/s' } });
      if (String(url) === 'https://upload.example/s') { if (opts.body) for await (const _ of opts.body) { /* drain */ } return new Response(JSON.stringify({ id: 'V1', status: {} }), { status: 200 }); }
      if (String(url).includes('/captions')) return new Response(JSON.stringify({ id: 'C1' }), { status: 200 });
      return new Response('{}', { status: 404 });
    };
    const yt = new YouTube({ clientId: 'c', clientSecret: 's', redirectUri: 'https://x/cb', tokenFile: path.join(dir, 'tok'), secret: 'k', fetchImpl: fakeFetch });
    assert.ok(yt.authUrl('s').includes('youtube.force-ssl'));
    await yt.exchange('code');
    assert.equal(yt.canCaption, true);
    await yt.upload(path.join(dir, 'v.mp4'), { title: 'T', description: 'D', tags: [], localizations: { 'pt-BR': { title: 'T-pt', description: 'D-pt' } } });
    const init = calls.find(c => c.url.includes('uploadType=resumable'));
    assert.match(init.url, /part=snippet,status,localizations/);
    assert.equal(JSON.parse(init.opts.body).localizations['pt-BR'].title, 'T-pt');
    assert.equal(await yt.caption('V1', 'pt-BR', 'Português', 'WEBVTT\n'), 'C1');
    const cap = calls.find(c => c.url.includes('/captions'));
    assert.match(cap.opts.headers['Content-Type'], /^multipart\/related; boundary=/);
    assert.match(cap.opts.body.toString(), /"language":"pt-BR"/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
