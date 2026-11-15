#!/usr/bin/env node
/** Restore exact runtime assets from a published HTTPS game using the source
 * archive's manifest. No credentials, package dependencies or local server. */
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, constants } from 'node:fs';
import { readFile, lstat, mkdir, copyFile, unlink, realpath } from 'node:fs/promises';
import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const root = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '..'));

function validateEntry(entry) {
  if (!entry || typeof entry.path !== 'string' || !entry.path.startsWith('public/assets/')) throw new Error('Invalid asset path in manifest');
  const parts = entry.path.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || /[\\\x00-\x1f:]/.test(part))) throw new Error('Unsafe asset path in manifest');
  if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || !/^[a-f0-9]{64}$/.test(entry.sha256 ?? '')) throw new Error(`Invalid asset hash/size: ${entry.path}`);
  const destination = resolve(root, ...parts), containment = relative(resolve(root, 'public/assets'), destination);
  if (!containment || containment === '..' || containment.startsWith('..' + sep) || resolve(destination) !== destination) throw new Error('Asset path escapes public/assets');
  return { ...entry, parts, destination };
}

async function inspect(path) {
  try { return await lstat(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function safeParents(parts) {
  let directory = root;
  for (const part of parts.slice(0, -1)) {
    directory = resolve(directory, part);
    const info = await inspect(directory);
    if (info?.isSymbolicLink() || info && !info.isDirectory()) throw new Error('Refusing asset parent that is not a real directory');
    if (!info) await mkdir(directory);
  }
}

async function checksum(path) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}

async function download(entry, base) {
  await safeParents(entry.parts);
  const existing = await inspect(entry.destination);
  if (existing) {
    if (!existing.isFile() || existing.isSymbolicLink()) throw new Error('Refusing non-regular asset destination');
    if (existing.size === entry.bytes && await checksum(entry.destination) === entry.sha256) return 'verified';
    throw new Error(`Existing asset differs from manifest: ${entry.path}. Move it aside before retrying.`);
  }
  const url = new URL(entry.parts.slice(1).map(encodeURIComponent).join('/'), base);
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(120_000) });
  if (!response.ok || !response.body) throw new Error(`Asset download returned HTTP ${response.status}: ${entry.path}`);
  const temporary = resolve(dirname(entry.destination), '.download-' + randomUUID());
  let bytes = 0;
  const digest = createHash('sha256');
  const check = new Transform({ transform(chunk, _encoding, done) {
    bytes += chunk.length;
    if (bytes > entry.bytes) { done(new Error(`Asset exceeds manifest size: ${entry.path}`)); return; }
    digest.update(chunk); done(null, chunk);
  } });
  try {
    await pipeline(Readable.fromWeb(response.body), check, createWriteStream(temporary, { flags: 'wx', mode: 0o644 }));
    if (bytes !== entry.bytes || digest.digest('hex') !== entry.sha256) throw new Error(`Asset integrity check failed: ${entry.path}`);
    // Never overwrite a file, including one created during the download.
    await copyFile(temporary, entry.destination, constants.COPYFILE_EXCL);
  } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  return 'downloaded';
}

async function main() {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/fetch-assets.mjs https://published-game.example/');
  const base = new URL(process.argv[2]);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('Provide the published game HTTPS base URL without credentials, query or fragment');
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  const manifest = JSON.parse(await readFile(resolve(root, 'asset-manifest.json'), 'utf8'));
  if (manifest.version !== 1 || manifest.algorithm !== 'sha256' || manifest.assetDirectory !== 'public/assets' || !Array.isArray(manifest.files) || !manifest.files.length) throw new Error('Unsupported or empty asset manifest');
  const entries = manifest.files.map(validateEntry);
  if (new Set(entries.map(entry => entry.path)).size !== entries.length) throw new Error('Duplicate asset paths in manifest');
  let downloaded = 0, verified = 0;
  for (const entry of entries) {
    const result = await download(entry, base);
    if (result === 'downloaded') downloaded++; else verified++;
    console.log(`${result}: ${entry.path}`);
  }
  console.log(`Assets ready: ${downloaded} downloaded, ${verified} already verified. Run npm ci, then npm run dev.`);
}

await main().catch(error => { console.error(error.message); process.exitCode = 1; });
