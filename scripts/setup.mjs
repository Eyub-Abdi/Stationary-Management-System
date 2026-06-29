/* eslint-disable no-console */
/**
 * Project setup / update orchestrator. Cross-platform (pure Node), so it runs
 * the same on a Windows or Linux server — no bash/PowerShell differences.
 *
 * Prerequisites you install yourself: Node.js, npm, PostgreSQL (running), and a
 * filled-in `.env` (DATABASE_URL + SEED_ADMIN_EMAIL/PASSWORD). Native modules
 * (argon2) need build tools present.
 *
 * Usage:
 *   node scripts/setup.mjs            # first-time setup (includes admin seed)
 *   node scripts/setup.mjs update     # apply migrations + rebuild (no git pull)
 *   node scripts/setup.mjs pull       # git pull, then install/migrate/build *only when needed*
 *
 * Or via npm:  npm run setup   /   npm run update   /   npm run pull
 *
 * All modes are safe to re-run: migrations apply only what's pending and the
 * admin seed upserts (never duplicates).
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODE = (process.argv[2] || 'setup').toLowerCase();

// The server has no `origin` remote configured, so `pull` fetches directly from
// the repo URL + branch. Override with REPO_URL / REPO_BRANCH if they ever change.
const REPO_URL =
  process.env.REPO_URL || 'https://github.com/Eyub-Abdi/Stationary-Management-System.git';
const REPO_BRANCH = process.env.REPO_BRANCH || 'main';

if (!['setup', 'update', 'pull'].includes(MODE)) {
  console.error(`Unknown mode "${MODE}". Use "setup", "update" or "pull".`);
  process.exit(1);
}

// --- Minimal .env loader ----------------------------------------------------
// Prisma CLI reads .env on its own, but `ts-node` (the admin seed) does not, so
// we load it here and pass it to every step. Real environment vars win.
function loadEnv() {
  const path = join(ROOT, '.env');
  if (!existsSync(path)) {
    console.error('✗ No .env file found at project root. Create it before running setup.');
    process.exit(1);
  }
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).replace(/^export\s+/, '').trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

function requireEnv(keys) {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`✗ Missing required .env values: ${missing.join(', ')}`);
    process.exit(1);
  }
}

function run(label, cmd, hint) {
  console.log(`\n→ ${label}\n  $ ${cmd}`);
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'inherit', env: process.env });
  } catch {
    console.error(`\n✗ Failed: ${label}`);
    if (hint) console.error(`  ${hint}`);
    process.exit(1);
  }
}

// devDependencies (Prisma CLI, Nest build, ts-node) are required to build/seed,
// so force them in even when NODE_ENV=production prunes them.
const NPM_INSTALL = 'npm install --include=dev';
const NPM_INSTALL_FRONTEND = 'npm --prefix frontend install --include=dev';

// Windows locks the Prisma query engine while the app runs, so `prisma generate`
// fails with EPERM. This hint is shown if that step fails.
const PRISMA_HINT =
  'If this is an EPERM/permission error on query_engine*.dll, the STMS app is still running. ' +
  'Stop the app/service (or the startup launcher), then run this again.';

function stopAppReminder() {
  console.log(
    '\n  Reminder: stop the running STMS app/service first — Windows locks the Prisma engine while it runs.',
  );
}

/**
 * Self-heal: if the build tools are missing (devDependencies were pruned, e.g.
 * by an earlier production install), reinstall them so the build can run.
 */
function ensureBuildable() {
  const bin = (base, name) =>
    join(base, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name);
  if (!existsSync(bin(ROOT, 'nest'))) {
    console.log('\n· Backend build tools missing (dev deps pruned) — installing');
    run('Install backend dependencies', NPM_INSTALL);
  }
  if (!existsSync(bin(join(ROOT, 'frontend'), 'vite'))) {
    console.log('· Frontend build tools missing — installing');
    run('Install frontend dependencies', NPM_INSTALL_FRONTEND);
  }
}

/** Run a command and return its trimmed stdout (no streaming). */
function capture(cmd) {
  return execSync(cmd, { cwd: ROOT, env: process.env }).toString().trim();
}

/**
 * On Windows, drop a double-clickable desktop icon that opens the app in the
 * browser (no terminal for the shop user). Non-fatal if it can't be created.
 */
function createDesktopShortcutWindows() {
  if (process.platform !== 'win32') return;
  try {
    const desktop = capture(
      'powershell -NoProfile -Command "[Environment]::GetFolderPath(\'Desktop\')"',
    );
    if (!desktop || !existsSync(desktop)) return;
    const file = join(desktop, 'STMS.url');
    const ico = join(ROOT, 'assets', 'STMS.ico');
    const lines = [
      '[InternetShortcut]',
      'URL=http://localhost:3000',
      ...(existsSync(ico) ? [`IconFile=${ico}`] : []),
      'IconIndex=0',
      '',
    ];
    writeFileSync(file, lines.join('\r\n'), 'utf8');
    console.log(`\n✓ Desktop icon created: ${file}`);
  } catch {
    /* best-effort */
  }
}

/** `pull` mode: git pull, then run only the steps whose inputs changed. */
function pullAndUpdate() {
  console.log('\n=== STMS — pull & update ===');
  stopAppReminder();

  let before;
  try {
    before = capture('git rev-parse HEAD');
  } catch {
    console.error('✗ This is not a git repository, or git is not installed.');
    process.exit(1);
  }

  // This box is a read-only mirror: it never edits source, but builds and npm
  // can rewrite tracked artifacts (e.g. lockfiles) and leave local drift that
  // would block a fast-forward pull. Discard that drift first so pull is clean.
  // (Real source is only ever changed and committed on the dev machine.)
  run('Discard local changes (deploy mirror)', 'git checkout -- .');

  run(`Pull latest changes (${REPO_BRANCH})`, `git pull --ff-only ${REPO_URL} ${REPO_BRANCH}`);

  const after = capture('git rev-parse HEAD');
  if (before === after) {
    console.log('\n✓ Already up to date — nothing to build.');
    return;
  }

  const changed = capture(`git diff --name-only ${before} ${after}`)
    .split(/\r?\n/)
    .filter(Boolean);
  const touched = (prefix) => changed.some((f) => f === prefix || f.startsWith(prefix));

  if (touched('package.json') || touched('package-lock.json')) {
    run('Install backend dependencies (changed)', NPM_INSTALL);
  } else {
    console.log('\n· Backend dependencies unchanged — skipping install');
  }

  if (touched('frontend/package.json') || touched('frontend/package-lock.json')) {
    run('Install frontend dependencies (changed)', NPM_INSTALL_FRONTEND);
  } else {
    console.log('· Frontend dependencies unchanged — skipping install');
  }

  if (touched('prisma/')) {
    run('Generate Prisma client (schema changed)', 'npx prisma generate', PRISMA_HINT);
    run('Apply database migrations', 'npx prisma migrate deploy');
  } else {
    console.log('· No schema/migration changes — skipping Prisma');
  }

  ensureBuildable();
  run('Build backend + frontend', 'npm run build:all');
}

// --- Steps ------------------------------------------------------------------
loadEnv();
requireEnv(MODE === 'setup' ? ['DATABASE_URL', 'SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD'] : ['DATABASE_URL']);

if (MODE === 'pull') {
  pullAndUpdate();
  console.log('\n✓ Done. Restart the app / service to pick up the new build.');
  process.exit(0);
}

console.log(`\n=== STMS — ${MODE === 'setup' ? 'initial setup' : 'update'} ===`);
if (MODE === 'update') stopAppReminder();

run('Install backend dependencies', NPM_INSTALL);
run('Install frontend dependencies', NPM_INSTALL_FRONTEND);
run('Generate Prisma client', 'npx prisma generate', PRISMA_HINT);
run('Apply database migrations', 'npx prisma migrate deploy');

if (MODE === 'setup') {
  run('Seed admin user (from .env)', 'npm run prisma:seed:admin');
}

ensureBuildable();
run('Build backend + frontend', 'npm run build:all');

if (MODE === 'setup') {
  createDesktopShortcutWindows();
}

console.log('\n✓ Done.');
if (MODE === 'setup') {
  console.log(`  Admin: ${process.env.SEED_ADMIN_EMAIL}`);
}
console.log('  Start the app with:  npm run serve   (then open http://localhost:3000)');
if (process.platform === 'win32') {
  console.log(
    '\n  To run STMS automatically on boot with NO terminal window, open a terminal\n' +
      '  as Administrator (right-click → Run as administrator) and run:\n' +
      '      npm run service:install\n' +
      '  This installs a Windows service and a desktop icon. Remove it with:\n' +
      '      npm run service:uninstall',
  );
}
console.log('  If running as a service, restart it to pick up the new build:  npm run service:stop && npm run service:start');
