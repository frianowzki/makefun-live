// makefun-frontend-01 entrypoint (Node 22, standard library only): this program hands the frontend in.
//
// The frontend is this directory's app/ folder: plain static files a browser opens at app/index.html (ES modules and
// CSS, no build step, no install), reading make.fun's public API at https://make.fun/api. The screenshots/ folder holds
// the three 1280x800 JPEG captures of that app running on live data (shots.json says which view each one is). Both are
// copied here into the output directory, and then vendor/makefun-frontend.ts writes dossier.json beside them: the
// summary a judge reads (the screenshots, the first load's files and bytes, and the source, as makefun/dossier/v1).
//
// The run is deterministic on purpose (the bounty's run_deterministic check runs it twice and compares): the copies are
// journaled through Steps, every written file is read back and hashed against its source, and nothing depends on the
// clock, the locale or the order the platform lists a directory in.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// vendor/makefun-frontend.ts is make.fun's own copy, byte for byte: the scorer writes dossier.json with the same file
// and refuses an entry whose dossier differs from it. Never edit it.

import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier, type DossierCaps } from './vendor/makefun-frontend.ts';

// ------------------------------------------------------------------ the entry's contract

/** Where this program, app/ and screenshots/ live: beside main.ts, wherever the entry was unpacked. */
const here = dirname(fileURLToPath(import.meta.url));

/** The output directory: MAKEFUN_OUTPUT_DIR outside the grader's container, /output inside it. */
const outputEnv = process.env.MAKEFUN_OUTPUT_DIR;
const outputDir = resolve(outputEnv ?? '/output');

/** The folders copied in whole, in this order. */
const COPIED: readonly string[] = ['app', 'screenshots'];

/**
 * The scorer's caps, as the bounty's gate hands them to buildDossier: the text's cap shapes the bytes, the rest only
 * refuse an entry the scorer would refuse (at most 3 screenshots, each at most 256 KiB and PNG or JPEG; app/ within
 * 993 files and directories, 16 MiB of files, and every path within 1,000 UTF-8 bytes).
 */
const CAPS: DossierCaps = {
  text_max_bytes: 163840,
  screenshots: { max: 3, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 16777216,
  app_path_max_bytes: 1000,
};

/** The page a browser opens, under app/. */
const INDEX = 'index.html';

/** How many captures the entry hands in, and the viewport every one of them is taken at. */
const SHOT_COUNT = CAPS.screenshots!.max;
const SHOT_WIDTH = 1280;
const SHOT_HEIGHT = 800;

/** Why the run cannot go on: a fault in what this directory holds, named with what to fix. */
class EntryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EntryError';
  }
}

// ------------------------------------------------------------------ small facts

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

const posix = (path: string): string => path.split(sep).join('/');

/** Code-unit order: the same on every machine (localeCompare is not, readdirSync's order is the platform's). */
const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Every directory and file under `dir`, as POSIX paths relative to it, in code-unit order; a symbolic link is refused. */
function walk(dir: string, from = ''): string[] {
  const found: string[] = [];
  const entries = readdirSync(join(dir, from), { withFileTypes: true }).sort((a, b) => byCodeUnit(a.name, b.name));
  for (const entry of entries) {
    const path = from === '' ? entry.name : `${from}/${entry.name}`;
    if (lstatSync(join(dir, path)).isSymbolicLink()) throw new EntryError(`${path}: a symbolic link (the entry hands in plain files and directories only)`);
    found.push(path);
    if (entry.isDirectory()) found.push(...walk(dir, path));
  }
  return found;
}

/** Whether `child` is `parent` or lies under it, on resolved paths (case-insensitively where the platform is). */
function within(child: string, parent: string): boolean {
  const fold = (p: string): string => (process.platform === 'win32' || process.platform === 'darwin' ? p.toLowerCase() : p);
  const c = fold(resolve(child));
  const p = fold(resolve(parent));
  return c === p || c.startsWith(p.endsWith(sep) ? p : `${p}${sep}`);
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

// ------------------------------------------------------------------ shots.json: what each capture is

/**
 * The captures shots.json records, or why it cannot: a list of {file, route (or the starter's path), viewport
 * {width, height}}. It says what the screenshots were taken of; the program checks it, never rewrites it.
 */
function readShots(shotsPath: string): { file: string; route: string; width: number; height: number }[] {
  let raw: string;
  try {
    raw = readFileSync(shotsPath, 'utf8');
  } catch {
    throw new EntryError('shots.json: missing (it records the route and viewport of each screenshot)');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    throw new EntryError(`shots.json: not JSON (${(error as Error).message})`);
  }
  if (!Array.isArray(parsed)) throw new EntryError('shots.json: not a list of captures');
  return parsed.map((entry, at) => {
    const where = `shots.json: capture ${at + 1}`;
    if (!isRecord(entry)) throw new EntryError(`${where}: not an object {file, route, viewport}`);
    const file = entry.file;
    if (typeof file !== 'string' || file.trim() === '') throw new EntryError(`${where}: names no "file"`);
    const route = entry.route ?? entry.path;
    if (typeof route !== 'string' || route.trim() === '') throw new EntryError(`${where} (${file}): names no route (a "route" or "path" string)`);
    const viewport = entry.viewport;
    if (!isRecord(viewport)) throw new EntryError(`${where} (${file}): names no viewport ({width, height})`);
    const { width, height } = viewport;
    if (typeof width !== 'number' || typeof height !== 'number' || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
      throw new EntryError(`${where} (${file}): its viewport must be two whole numbers, not ${JSON.stringify(viewport)}`);
    }
    return { file, route, width, height };
  });
}

/**
 * screenshots/ checked before anything is copied: the folder holds exactly the three captures and nothing else, each
 * is a JPEG the screenshot cap takes, and shots.json lists exactly that set with a route and a viewport each. Every
 * capture must record the viewport it is advertised at, since that is what the entry claims of it. Returns the names,
 * in order; the first by name is the cover.
 */
function checkScreenshots(shotsDir: string, shots: { file: string; route: string; width: number; height: number }[]): string[] {
  if (!existsSync(shotsDir) || !statSync(shotsDir).isDirectory()) throw new EntryError('screenshots/: missing (three JPEG captures of the running app, the first by name the cover)');
  const files = readdirSync(shotsDir, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.'))
    .map((entry) => {
      if (!entry.isFile()) throw new EntryError(`screenshots/${entry.name}: not a plain file (the folder holds the captures and nothing else)`);
      return entry.name;
    })
    .sort(byCodeUnit);
  if (files.length !== SHOT_COUNT) throw new EntryError(`screenshots/: holds ${files.length} file${files.length === 1 ? '' : 's'}, and the entry hands in exactly ${SHOT_COUNT}`);
  const maxBytes = CAPS.screenshots!.max_bytes;
  for (const name of files) {
    if (!/\.jpe?g$/i.test(name)) throw new EntryError(`screenshots/${name}: not a JPEG (.jpg or .jpeg)`);
    const bytes = new Uint8Array(readFileSync(join(shotsDir, name)));
    if (bytes.length > maxBytes) throw new EntryError(`screenshots/${name}: ${bytes.length} bytes, over the ${maxBytes} the screenshot cap allows`);
    if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) throw new EntryError(`screenshots/${name}: does not open as a JPEG`);
  }
  const listed = shots.map((shot) => shot.file);
  if (listed.length !== files.length || [...listed].sort(byCodeUnit).join('\n') !== files.join('\n')) {
    throw new EntryError(`shots.json lists [${listed.join(', ')}] and screenshots/ holds [${files.join(', ')}]: the two must name exactly the same files`);
  }
  for (const shot of shots) {
    if (shot.width !== SHOT_WIDTH || shot.height !== SHOT_HEIGHT) {
      throw new EntryError(`shots.json: ${shot.file} records a ${shot.width}x${shot.height} viewport, and the entry's captures are ${SHOT_WIDTH}x${SHOT_HEIGHT}`);
    }
  }
  return files;
}

// ------------------------------------------------------------------ the output directory and its journal

/** One step of the run, as the journal records it. */
interface Step {
  action: 'mkdir' | 'copy' | 'write';
  to: string;
  bytes?: number;
  sha256?: string;
}

/** The steps taken, written to the output directory as sh/Steps when the run ends: what was done, in order, and its totals. */
class Steps {
  readonly list: Step[] = [];
  private readonly done = new Set<string>();
  /** The output directory every step lands in (a plain field: a constructor parameter property is not strip-only TS). */
  private readonly out: string;

  constructor(out: string) {
    this.out = out;
  }

  /** A directory in the output, created with its parents; recorded once however often it is asked for. */
  mkdir(path: string): void {
    this.inside(path);
    if (this.done.has(path)) return;
    mkdirSync(path, { recursive: true });
    this.done.add(path);
    this.list.push({ action: 'mkdir', to: posix(relative(this.out, path)) });
  }

  /** A file copied byte for byte, read back and hashed against its source. */
  copy(from: string, to: string): Step {
    this.inside(to);
    this.mkdir(dirname(to));
    copyFileSync(from, to);
    return this.record('copy', to, new Uint8Array(readFileSync(from)));
  }

  /** Bytes written, read back and hashed. */
  write(to: string, bytes: Uint8Array): Step {
    this.inside(to);
    this.mkdir(dirname(to));
    writeFileSync(to, bytes);
    return this.record('write', to, bytes);
  }

  /** The journal: one line a step in the order taken, then the totals. */
  text(): string {
    const lines = this.list.map((s) => `${s.action} ${s.to}${s.bytes === undefined ? '' : ` ${s.bytes} bytes sha256 ${s.sha256}`}`);
    const files = this.list.filter((s) => s.action !== 'mkdir');
    lines.push(`totals ${files.length} files, ${files.reduce((n, s) => n + (s.bytes ?? 0), 0)} bytes; ${this.list.length - files.length} directories`);
    return `${lines.join('\n')}\n`;
  }

  /** The step read back from disk: its bytes must be exactly the ones it should hold. */
  private record(action: 'copy' | 'write', to: string, expected: Uint8Array): Step {
    const written = new Uint8Array(readFileSync(to));
    const digest = sha256(written);
    if (written.length !== expected.length || digest !== sha256(expected)) throw new EntryError(`${posix(relative(this.out, to))}: read back ${written.length} bytes, not the ${expected.length} written`);
    const step: Step = { action, to: posix(relative(this.out, to)), bytes: written.length, sha256: digest };
    this.list.push(step);
    return step;
  }

  private inside(path: string): void {
    if (!within(path, this.out)) throw new EntryError(`${path}: outside the output directory ${this.out}`);
  }
}

/**
 * The output directory checked before anything is written: the variable set (an unset one would mean the grader's own
 * /output), the path absolute, not inside the source directory (a copy into app/ would feed the app a dossier of
 * itself) and not the source directory or above it, and an existing directory or nothing at all.
 */
function checkOutput(): void {
  if (outputEnv === undefined || outputEnv.trim() === '') throw new EntryError('MAKEFUN_OUTPUT_DIR: not set (outside the grader, set it to the output directory, e.g. out)');
  if (!isAbsolute(outputDir)) throw new EntryError(`MAKEFUN_OUTPUT_DIR ${outputDir}: not an absolute path`);
  if (within(outputDir, here)) throw new EntryError(`MAKEFUN_OUTPUT_DIR ${outputDir}: inside the source directory ${here} (the output belongs beside it, never in it)`);
  if (within(here, outputDir)) throw new EntryError(`MAKEFUN_OUTPUT_DIR ${outputDir}: holds the source directory ${here} (the output may not be the source or a parent of it)`);
  if (resolve(outputDir) === resolve(sep)) throw new EntryError(`MAKEFUN_OUTPUT_DIR ${outputDir}: the filesystem root`);
  const stats = existsSync(outputDir) ? statSync(outputDir) : null;
  if (stats !== null && !stats.isDirectory()) throw new EntryError(`MAKEFUN_OUTPUT_DIR ${outputDir}: a file, not a directory`);
}

// ------------------------------------------------------------------ the run

/** app/ checked beside main.ts: the folder, and the page a browser opens in it. */
function checkApp(appDir: string): void {
  if (!existsSync(appDir) || !statSync(appDir).isDirectory()) throw new EntryError('app/: missing (the frontend is a directory of static files)');
  const index = join(appDir, INDEX);
  if (!existsSync(index) || !statSync(index).isFile()) throw new EntryError(`app/${INDEX}: missing (the page a browser opens)`);
}

function main(): void {
  const appDir = join(here, 'app');
  const shotsDir = join(here, 'screenshots');
  checkApp(appDir);
  const shots = readShots(join(here, 'shots.json'));
  const names = checkScreenshots(shotsDir, shots);
  checkOutput();

  const steps = new Steps(outputDir);
  steps.mkdir(outputDir);
  for (const folder of COPIED) {
    const from = join(here, folder);
    const to = join(outputDir, basename(from));
    steps.mkdir(to);
    for (const path of walk(from)) {
      if (statSync(join(from, path)).isDirectory()) steps.mkdir(join(to, path));
      else steps.copy(join(from, path), join(to, path));
    }
  }

  const dossier = buildDossier(outputDir, CAPS);
  steps.write(join(outputDir, 'dossier.json'), dossier);
  const journal = steps.write(join(outputDir, 'sh', 'Steps'), new TextEncoder().encode(steps.text()));

  const parsed = JSON.parse(Buffer.from(dossier).toString('utf8')) as { schema: string; images: { name: string; media_type: string; sha256: string; base64: string }[]; text: string };
  const copied = steps.list.filter((s) => s.action === 'copy');
  console.log(`main.ts: output ${outputDir}`);
  console.log(`main.ts: ${copied.length} files copied into ${COPIED.join('/ and ')}/ (${names.join(', ')})`);
  console.log(`main.ts: ${/^Totals: .*$/m.exec(parsed.text)?.[0] ?? 'Totals: (none)'}`);
  console.log(`main.ts: dossier.json ${dossier.length} bytes ${parsed.schema} sha256 ${sha256(dossier)}`);
  for (const image of parsed.images) {
    console.log(`main.ts: screenshots/${image.name} ${Buffer.from(image.base64, 'base64').length} bytes ${image.media_type} sha256 ${image.sha256}`);
  }
  console.log(`main.ts: sh/Steps ${journal.bytes} bytes sha256 ${journal.sha256}`);
}

try {
  main();
} catch (error) {
  if (error instanceof EntryError) {
    console.error(`main.ts: ${error.message}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
