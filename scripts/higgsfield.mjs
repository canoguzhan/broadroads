/* Higgsfield API client for the asset scripts (Seedance 2.5 video and
   friends). Credentials come from HF_CREDENTIALS="<key id>:<key secret>"
   in the environment or the git-ignored .env. Server/script use only:
   never ship the key to the browser. */
import fs from 'node:fs';
import { createHiggsfieldClient } from '@higgsfield/client/v2';

export function loadEnv(file = '.env') {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* no .env */ }
}

loadEnv();
if (!process.env.HF_CREDENTIALS) throw new Error('Set HF_CREDENTIALS="<key id>:<key secret>" (in .env or the environment).');

export const hf = createHiggsfieldClient({ credentials: process.env.HF_CREDENTIALS }, { withPolling: true });
const API = 'https://api.higgsfield.ai';
const auth = { Authorization: `Key ${process.env.HF_CREDENTIALS}` };

export const SEEDANCE_T2V = 'bytedance/seedance-2.5/text-to-video';
export const SEEDANCE_I2V = 'bytedance/seedance-2.5/image-to-video';

/** Uploads a local image and returns its URL (for image_url inputs). */
export async function uploadImage(file) {
  // Presigned upload. (The SDK's helpers use other auth headers or need Agent API access.)
  const type = `image/${file.endsWith('.png') ? 'png' : file.endsWith('.webp') ? 'webp' : 'jpeg'}`;
  const link = await fetch(`${API}/files/generate-upload-url`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ content_type: type }) });
  if (!link.ok) throw new Error(`upload link: ${link.status} ${await link.text()}`);
  const { upload_url, public_url, upload_headers } = await link.json();
  const put = await fetch(upload_url, { method: 'PUT', headers: { 'Content-Type': type, ...upload_headers }, body: fs.readFileSync(file) });
  if (!put.ok) throw new Error(`upload: ${put.status}`);
  return public_url;
}

/** Runs a generation to completion and returns the result URL (video or image). */
export async function generate(model, input) {
  let res;
  try {
    res = await hf.subscribe(model, { input, withPolling: true });
  } catch (err) {
    // The SDK drops the response body; the API explains 4xx errors (e.g. not_enough_credits).
    const r = await fetch(`${API}/${model}`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(input) }).catch(() => null);
    const detail = r && !r.ok ? (await r.json().catch(() => ({}))).detail : null;
    throw new Error(`${model}: ${detail || err.message}`);
  }
  if (res.status !== 'completed') throw new Error(`${model}: ${res.status === 'nsfw' ? 'rejected by moderation' : res.status} (request ${res.request_id})`);
  const url = res.video?.url || res.images?.[0]?.url;
  if (!url) throw new Error(`${model}: no result URL (request ${res.request_id})`);
  return url;
}
