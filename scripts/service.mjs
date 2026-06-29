/* eslint-disable no-console */
/**
 * Install / manage STMS as a real Windows Service so the app runs on boot,
 * hidden (no terminal), and restarts itself if it crashes — and drops a desktop
 * icon that opens the app in the browser. No terminal for the shop user.
 *
 * MUST be run from an Administrator terminal (installing a service is elevated).
 *
 * Usage (as Administrator):
 *   npm run service:install      # register + start the service, create desktop icon
 *   npm run service:uninstall    # stop + remove the service
 *   node scripts/service.mjs start | stop
 *
 * The service runs `scripts/service-runner.cjs`, which pins the working
 * directory to the project root and starts `dist/src/main.js`. Build first
 * (`npm run build:all`).
 */
import { execSync } from 'node:child_process';
import { existsSync, writeFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODE = (process.argv[2] || 'install').toLowerCase();

const SERVICE_NAME = 'STMS';
const SERVICE_DESC = 'STMS — Stationery Management System server';
const APP_URL = 'http://localhost:3000';
const RUNNER = join(ROOT, 'scripts', 'service-runner.cjs');
const BUILT_SERVER = join(ROOT, 'dist', 'src', 'main.js');

if (process.platform !== 'win32') {
  console.error('✗ The Windows Service installer only runs on Windows.');
  process.exit(1);
}
if (!['install', 'uninstall', 'start', 'stop'].includes(MODE)) {
  console.error(`Unknown mode "${MODE}". Use install | uninstall | start | stop.`);
  process.exit(1);
}

/**
 * The service wrapper (winsw) runs on .NET Framework 2.0/3.5 or 4.x. Windows 10
 * and 11 ship .NET 4.8 by default, so this normally passes — but on a stripped
 * install it can be missing, which makes the service install yet never start.
 * Warn early with a clear fix instead of a cryptic failure.
 */
function checkDotNet() {
  const winDir = process.env.WINDIR || 'C:\\Windows';
  const frameworkDirs = ['Framework64', 'Framework'];
  const versions = ['v4.0.30319', 'v2.0.50727'];
  const found = frameworkDirs.some((arch) =>
    versions.some((v) => existsSync(join(winDir, 'Microsoft.NET', arch, v))),
  );
  if (!found) {
    console.warn(
      '\n⚠ .NET Framework was not detected. The Windows service needs .NET Framework 4.x\n' +
        '  (or 3.5). Windows 10/11 include it by default; if this is a stripped install,\n' +
        '  enable ".NET Framework 4.8" via Settings > Apps > Optional features (or Windows\n' +
        '  Features), then run this again. Continuing anyway…',
    );
  }
}

/** True when running elevated (installing/removing a service needs admin). */
function isAdmin() {
  try {
    execSync('net session', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** The user's real Desktop path (handles OneDrive redirection). */
function desktopDir() {
  try {
    return execSync(
      'powershell -NoProfile -Command "[Environment]::GetFolderPath(\'Desktop\')"',
      { encoding: 'utf8' },
    ).trim();
  } catch {
    return join(process.env.USERPROFILE || ROOT, 'Desktop');
  }
}

/** Drop a double-clickable desktop icon that opens the app in the browser. */
function createDesktopShortcut() {
  const dir = desktopDir();
  if (!existsSync(dir)) return;
  const file = join(dir, 'STMS.url');
  // .url internet shortcut → opens the default browser at the app URL.
  writeFileSync(file, ['[InternetShortcut]', `URL=${APP_URL}`, 'IconIndex=0', ''].join('\r\n'), 'utf8');
  console.log(`✓ Desktop icon created: ${file}`);
}

/** Remove the per-user Startup launcher (Settings > Run on startup) so the
 * service and that launcher don't both start a server and fight over port 3000. */
function removeStartupLauncher() {
  const appData = process.env.APPDATA;
  if (!appData) return;
  const cmd = join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'STMS.cmd');
  if (existsSync(cmd)) {
    rmSync(cmd, { force: true });
    console.log('· Removed the old per-user Startup launcher (the service replaces it).');
  }
}

function makeService() {
  const { Service } = require('node-windows');
  return new Service({
    name: SERVICE_NAME,
    description: SERVICE_DESC,
    script: RUNNER,
    // Restart with a short backoff; give up only after many quick failures.
    wait: 2,
    grow: 0.5,
    maxRestarts: 10,
  });
}

function requireAdmin() {
  if (!isAdmin()) {
    console.error(
      '\n✗ This must be run as Administrator.\n' +
        '  Right-click your terminal → "Run as administrator", then run the command again.',
    );
    process.exit(1);
  }
}

if ((MODE === 'install' || MODE === 'uninstall' || MODE === 'start' || MODE === 'stop')) {
  requireAdmin();
}

const svc = makeService();

if (MODE === 'install') {
  if (!existsSync(BUILT_SERVER)) {
    console.error(`✗ Build not found at ${BUILT_SERVER}. Run "npm run build:all" first.`);
    process.exit(1);
  }
  checkDotNet();
  svc.on('alreadyinstalled', () => {
    console.log('· Service already installed — starting it.');
    svc.start();
  });
  svc.on('install', () => {
    console.log(`✓ Service "${SERVICE_NAME}" installed.`);
    svc.start();
  });
  svc.on('start', () => {
    removeStartupLauncher();
    createDesktopShortcut();
    console.log(`\n✓ STMS is running as a service and starts automatically on boot.`);
    console.log(`  Open the app from the new desktop icon, or visit ${APP_URL}`);
    process.exit(0);
  });
  svc.on('error', (e) => {
    console.error(`✗ Service error: ${e?.message ?? e}`);
    process.exit(1);
  });
  console.log(`→ Installing Windows service "${SERVICE_NAME}"…`);
  svc.install();
} else if (MODE === 'uninstall') {
  svc.on('uninstall', () => {
    console.log(`✓ Service "${SERVICE_NAME}" removed.`);
    const file = join(desktopDir(), 'STMS.url');
    if (existsSync(file)) {
      rmSync(file, { force: true });
      console.log('· Removed the desktop icon.');
    }
    process.exit(0);
  });
  svc.on('error', (e) => {
    console.error(`✗ Service error: ${e?.message ?? e}`);
    process.exit(1);
  });
  console.log(`→ Removing Windows service "${SERVICE_NAME}"…`);
  svc.uninstall();
} else if (MODE === 'start') {
  svc.on('start', () => {
    console.log('✓ Service started.');
    process.exit(0);
  });
  svc.on('error', (e) => { console.error(e); process.exit(1); });
  svc.start();
} else if (MODE === 'stop') {
  svc.on('stop', () => {
    console.log('✓ Service stopped.');
    process.exit(0);
  });
  svc.on('error', (e) => { console.error(e); process.exit(1); });
  svc.stop();
}
