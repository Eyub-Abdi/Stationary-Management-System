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
 *   node scripts/setup.mjs update     # after `git pull` (migrations + rebuild)
 *
 * Or via npm:  npm run setup   /   npm run update
 *
 * Both modes are safe to re-run: migrations apply only what's pending and the
 * admin seed upserts (never duplicates).
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODE = (process.argv[2] || 'setup').toLowerCase();

if (!['setup', 'update'].includes(MODE)) {
  console.error(`Unknown mode "${MODE}". Use "setup" or "update".`);
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

function run(label, cmd) {
  console.log(`\n→ ${label}\n  $ ${cmd}`);
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'inherit', env: process.env });
  } catch {
    console.error(`\n✗ Failed: ${label}`);
    process.exit(1);
  }
}

// --- Steps ------------------------------------------------------------------
loadEnv();
requireEnv(MODE === 'setup' ? ['DATABASE_URL', 'SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD'] : ['DATABASE_URL']);

console.log(`\n=== KJ Stationery — ${MODE === 'setup' ? 'initial setup' : 'update'} ===`);

run('Install backend dependencies', 'npm install');
run('Install frontend dependencies', 'npm --prefix frontend install');
run('Generate Prisma client', 'npx prisma generate');
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
