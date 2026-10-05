/* Replay files: gzipped newline-delimited JSON in <dataDir>/replays, with an
   index of the most recent ones. Served to clients at /replays/<id>.ndjson. */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const KEEP = 50;

export function fileReplays(dataDir) {
  const dir = path.join(dataDir, 'replays');
  fs.mkdirSync(dir, { recursive: true });
  const indexFile = path.join(dir, 'index.json');
  let index = [];
  try { index = JSON.parse(fs.readFileSync(indexFile, 'utf8')); } catch { index = []; }
  const fileOf = id => path.join(dir, `${id}.ndjson.gz`);

  return {
    async save(header, lines) {
      const body = await new Promise((ok, fail) => zlib.gzip([JSON.stringify(header), ...lines].join('\n'), (e, b) => (e ? fail(e) : ok(b))));
      await fs.promises.writeFile(fileOf(header.id), body);
      const { t, v, ...meta } = header;
      index.unshift({ ...meta, size: body.length });
      for (const old of index.slice(KEEP)) fs.promises.unlink(fileOf(old.id)).catch(() => {});
      index = index.slice(0, KEEP);
      await fs.promises.writeFile(indexFile, JSON.stringify(index));
    },
    async list() { return index.slice(0, 20); },
    meta(id) { return index.find(r => r.id === id) || null; },
    /** Absolute path of a stored replay, or null (ids are validated). */
    file(id) {
      if (!/^[a-z0-9]{6,24}$/.test(id)) return null;
      const f = fileOf(id);
      return fs.existsSync(f) ? f : null;
    },
  };
}
