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
import { existsSync, readFileSync } from 'node:fs';
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

/** Run a command and return its trimmed stdout (no streaming). */
function capture(cmd) {
  return execSync(cmd, { cwd: ROOT, env: process.env }).toString().trim();
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

run('Build backend + frontend', 'npm run build:all');

console.log('\n✓ Done.');
if (MODE === 'setup') {
  console.log(`  Admin: ${process.env.SEED_ADMIN_EMAIL}`);
}
console.log('  Start the app with:  npm run serve   (then open http://localhost:3000)');
console.log('  If running as a service / startup launcher, restart it to pick up the new build.');
