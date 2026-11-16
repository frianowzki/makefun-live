// A makefun-frontend-01 entry (Node, standard library only).
//
// The app is app/: plain static files a browser opens at app/index.html (ES modules, CSS, no build
// step) that read make.fun's public API at https://make.fun/api. This program hands it in. It
// checks the hand-off is real before writing anything: the output directory must be an absolute
// path outside this repository, app/index.html must exist, and screenshots/ must hold exactly the
// 3 JPEG captures shots.json names, each at most 256 KiB and at most 1280 by 800 pixels. Then it
// copies app/ and screenshots/ into the output directory and writes dossier.json with the
// vendored library, byte for byte what the scorer's own copy writes.
//
// Serve locally:  node serve.ts --port 8129  ->  http://localhost:8129
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   MAKEFUN_OUTPUT_DIR=out node main.ts
//
// vendor/makefun-frontend.ts is the kit's copy, unchanged.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAX_SHOT_BYTES = 262144;
const MAX_SIDE = 1280;
const MIN_SIDE = 360;
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 3, max_bytes: MAX_SHOT_BYTES },
  app_max_files: 993,
  app_max_bytes: 16777216,
};

interface Shot {
  file: string;
  path: string;
  width: number;
  height: number;
}

function fail(message: string): never {
  console.error(`main.ts: ${message}`);
  process.exit(1);
  throw new Error(message);
}

// The output directory: an absolute path, never inside this repository.
function outputDirectory(): string {
  const given = process.env.MAKEFUN_OUTPUT_DIR;
  if (!given) fail('set MAKEFUN_OUTPUT_DIR to an absolute directory for the snapshot (for example: MAKEFUN_OUTPUT_DIR=out node main.ts)');
  if (!isAbsolute(given)) fail(`MAKEFUN_OUTPUT_DIR must be an absolute path, not "${given}"`);
  const out = resolve(given);
  const inside = relative(HERE, out);
  if (inside === '' || (!inside.startsWith('..') && !isAbsolute(inside))) {
    fail(`MAKEFUN_OUTPUT_DIR must be outside the source tree (${out} is inside ${HERE})`);
  }
  return out;
}

// shots.json is the contract: the 3 captures, the route each shows and its viewport.
function readShots(): Shot[] {
  const file = join(HERE, 'shots.json');
  if (!existsSync(file)) fail('shots.json is missing: it names the 3 screenshots this entry hands in');
  let listed: unknown;
  try {
    listed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`shots.json is not JSON (${(error as Error).message})`);
  }
  if (!Array.isArray(listed) || listed.length !== 3) fail(`shots.json must list exactly 3 shots, got ${Array.isArray(listed) ? listed.length : 'no array'}`);
  const seen = new Set<string>();
  const shots: Shot[] = [];
  for (let i = 0; i < listed.length; i++) {
    const raw = listed[i] as { file?: unknown; path?: unknown; viewport?: { width?: unknown; height?: unknown } } | null;
    if (raw === null || typeof raw !== 'object') fail(`shots.json[${i}] is not an object`);
    if (typeof raw.file !== 'string' || !/^[A-Za-z0-9_][A-Za-z0-9._-]*\.jpe?g$/i.test(raw.file)) fail(`shots.json[${i}].file must be a JPEG name like "1-board.jpg"`);
    if (seen.has(raw.file)) fail(`shots.json names ${raw.file} twice`);
    seen.add(raw.file);
    if (typeof raw.path !== 'string' || !raw.path.startsWith('#/')) fail(`shots.json[${i}].path must be a hash route like "#/"`);
    const width = raw.viewport ? raw.viewport.width : undefined;
    const height = raw.viewport ? raw.viewport.height : undefined;
    if (typeof width !== 'number' || typeof height !== 'number' || !Number.isInteger(width) || !Number.isInteger(height)) {
      fail(`shots.json[${i}].viewport must hold integer width and height`);
    }
    shots.push({ file: raw.file, path: raw.path, width, height });
  }
  return shots;
}

// A whole JPEG's pixel size, from its first start-of-frame segment.
function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  let at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) {
      at++;
      continue;
    }
    const marker = bytes[at + 1] as number;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
      continue;
    }
    const length = ((bytes[at + 2] as number) << 8) | (bytes[at + 3] as number);
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      const height = ((bytes[at + 5] as number) << 8) | (bytes[at + 6] as number);
      const width = ((bytes[at + 7] as number) << 8) | (bytes[at + 8] as number);
      return { width, height };
    }
    at += 2 + length;
  }
  return null;
}

// The 3 captures present, matching shots.json and inside the scorer's size caps.
function checkScreenshots(shots: Shot[]): void {
  const dir = join(HERE, 'screenshots');
  if (!existsSync(dir) || !statSync(dir).isDirectory()) fail('screenshots/ is missing: it holds the 3 captures');
  for (const name of readdirSync(dir).filter((entry) => !entry.startsWith('.'))) {
    if (!shots.some((shot) => shot.file === name)) fail(`screenshots/${name} is not one of the files shots.json names`);
  }
  for (const shot of shots) {
    const file = join(dir, shot.file);
    if (!existsSync(file)) fail(`screenshots/${shot.file} (named in shots.json) is missing`);
    const bytes = readFileSync(file);
    if (bytes.length > MAX_SHOT_BYTES) fail(`screenshots/${shot.file} is ${bytes.length} bytes, over the ${MAX_SHOT_BYTES} a screenshot may be`);
    const size = jpegSize(bytes);
    if (size === null) fail(`screenshots/${shot.file} is not a whole JPEG`);
    const long = Math.max(size.width, size.height);
    const short = Math.min(size.width, size.height);
    if (long > MAX_SIDE || short < MIN_SIDE) {
      fail(`screenshots/${shot.file} is ${size.width}x${size.height}: at most ${MAX_SIDE} on the long side, at least ${MIN_SIDE} on the short`);
    }
  }
}

function copyInto(out: string, shots: Shot[]): void {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, 'screenshots'), { recursive: true });
  cpSync(join(HERE, 'app'), join(out, 'app'), { recursive: true });
  for (const shot of shots) cpSync(join(HERE, 'screenshots', shot.file), join(out, 'screenshots', shot.file));
}

function main(): void {
  const out = outputDirectory();
  if (!existsSync(join(HERE, 'app', 'index.html'))) fail('app/index.html is missing: the page the entry opens at');
  const shots = readShots();
  checkScreenshots(shots);
  copyInto(out, shots);
  const dossier = buildDossier(out, CAPS);
  writeFileSync(join(out, 'dossier.json'), dossier);
  const text = Buffer.from(dossier).toString('utf8');
  const totals = /Totals: [^\\"]+/.exec(text);
  console.log(`dossier.json: ${dossier.length} bytes, ${shots.length} screenshots, app copied from ${join(HERE, 'app')}`);
  console.log(totals === null ? 'no Totals line found' : totals[0].replace(/\\\\n/g, ' | '));
}

main();
