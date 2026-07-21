import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { spawn } from 'child_process';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { PrismaService } from '../../prisma/prisma.service';

/** Temp working area for dumps being produced/uploaded (cleaned up after use). */
export const BACKUP_TMP_DIR = join(process.cwd(), 'backups', 'tmp');

/** Folder name used for on-disk automatic backups. */
const BACKUP_FOLDER = 'STMS-Backups';
/** Auto-backups older than this many days are pruned. */
const RETENTION_DAYS = 30;

type PgTool = 'pg_dump' | 'pg_restore';

export interface LocalBackupResult {
  dir: string;
  filename: string;
  path: string;
  sizeBytes: number;
}

/**
 * Wraps the PostgreSQL client tools to produce and apply custom-format dumps
 * (the same `-Fc` format as scripts/backup.sh). Backups are downloaded by the
 * admin and kept off-server; restore replaces the current database from an
 * uploaded dump. Local, cash-register-style deployment is assumed.
 */
@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(private readonly prisma: PrismaService) {}

  private dbUrl(): string {
    const url = process.env.DATABASE_URL;
    if (!url) throw new InternalServerErrorException('DATABASE_URL is not configured.');
    // Prisma appends `?schema=public`, which libpq (pg_dump/pg_restore) rejects
    // as an invalid URI parameter. Strip Prisma-only params before passing it on.
    try {
      const u = new URL(url);
      u.searchParams.delete('schema');
      u.searchParams.delete('connection_limit');
      u.searchParams.delete('pgbouncer');
      return u.toString();
    } catch {
      return url;
    }
  }

  /**
   * Locate a Postgres client binary. Order: PG_BIN_DIR env override, then a
   * standard Windows install (newest version first), then bare name (PATH).
   */
  private resolveBin(tool: PgTool): string {
    const exe = process.platform === 'win32' ? `${tool}.exe` : tool;
    const candidates: string[] = [];
    if (process.env.PG_BIN_DIR) candidates.push(join(process.env.PG_BIN_DIR, exe));
    if (process.platform === 'win32') {
      const base = 'C:\\Program Files\\PostgreSQL';
      if (existsSync(base)) {
        for (const v of readdirSync(base).sort().reverse()) {
          candidates.push(join(base, v, 'bin', exe));
        }
      }
    }
    return candidates.find((c) => existsSync(c)) ?? tool;
  }

  /** Runs a tool, resolving on exit 0 and rejecting with stderr otherwise. */
  private run(bin: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, { windowsHide: true });
      let stderr = '';
      child.stderr.on('data', (d) => (stderr += d.toString()));
      child.on('error', (e) =>
        reject(
          new InternalServerErrorException(
            `Could not run ${bin}. Is PostgreSQL installed? (${e.message})`,
          ),
        ),
      );
      child.on('close', (code) =>
        code === 0 ? resolve(stderr) : reject(new Error(stderr.trim() || `${bin} exited ${code}`)),
      );
    });
  }

  /**
   * Produces a compressed custom-format dump and verifies its table of contents.
   * Returns the temp path + a timestamped filename for the download.
   */
  async createDump(): Promise<{ path: string; filename: string }> {
    if (!existsSync(BACKUP_TMP_DIR)) mkdirSync(BACKUP_TMP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const filename = `kj_${stamp}.dump`;
    const path = join(BACKUP_TMP_DIR, filename);
    try {
      await this.run(this.resolveBin('pg_dump'), [
        `--dbname=${this.dbUrl()}`,
        '--format=custom',
        '--no-owner',
        '--no-privileges',
        `--file=${path}`,
      ]);
      // Integrity check: a valid dump lists a table of contents.
      await this.run(this.resolveBin('pg_restore'), ['--list', path]);
    } catch (e) {
      this.logger.error(`Backup failed: ${(e as Error).message}`);
      throw new InternalServerErrorException(`Backup failed: ${(e as Error).message}`);
    }
    return { path, filename };
  }

  /**
   * Default on-disk backup folder. On Windows this is drive D (the owner's data
   * disk) when present, otherwise the user's home folder; on other systems it is
   * always the home folder — a safe, writable, per-user location.
   */
  defaultBackupDir(): string {
    if (process.platform === 'win32' && existsSync('D:\\')) {
      return join('D:\\', BACKUP_FOLDER);
    }
    return join(homedir(), BACKUP_FOLDER);
  }

  /** The folder backups actually go to: the admin's override, or the default. */
  async effectiveBackupDir(): Promise<string> {
    const s = await this.prisma.appSetting.findUnique({ where: { id: 'singleton' } });
    return s?.backupDir?.trim() || this.defaultBackupDir();
  }

  /**
   * Writes a verified dump to the configured on-disk folder, prunes old files,
   * and records the outcome on the settings row. Used by the manual "Back up
   * now" button and the automatic scheduler. Rethrows on failure (after marking
   * lastBackupStatus) so callers can surface the error.
   */
  async runLocalBackup(): Promise<LocalBackupResult> {
    const dir = await this.effectiveBackupDir();
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const filename = `kj_${stamp}.dump`;
    const path = join(dir, filename);
    try {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      await this.run(this.resolveBin('pg_dump'), [
        `--dbname=${this.dbUrl()}`,
        '--format=custom',
        '--no-owner',
        '--no-privileges',
        `--file=${path}`,
      ]);
      await this.run(this.resolveBin('pg_restore'), ['--list', path]);
      const sizeBytes = statSync(path).size;
      this.prune(dir);
      await this.prisma.appSetting.update({
        where: { id: 'singleton' },
        data: { lastBackupAt: new Date(), lastBackupStatus: 'ok', lastBackupPath: path },
      });
      this.logger.log(`Local backup written to ${path} (${sizeBytes} bytes)`);
      return { dir, filename, path, sizeBytes };
    } catch (e) {
      const msg = (e as Error).message?.slice(0, 300) || 'Backup failed';
      this.logger.error(`Local backup failed: ${msg}`);
      await this.prisma.appSetting
        .update({ where: { id: 'singleton' }, data: { lastBackupStatus: msg } })
        .catch(() => undefined);
      throw new InternalServerErrorException(`Backup failed: ${msg}`);
    }
  }

  /** Deletes auto-backup dumps older than the retention window. */
  private prune(dir: string): void {
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    try {
      for (const name of readdirSync(dir)) {
        if (!/^kj_\d{14}\.dump$/.test(name)) continue;
        const full = join(dir, name);
        if (statSync(full).mtimeMs < cutoff) unlinkSync(full);
      }
    } catch (e) {
      this.logger.warn(`Backup prune skipped: ${(e as Error).message}`);
    }
  }

  /**
   * Replaces the current database from a dump file. Validates the file is a real
   * custom-format dump first, then restores atomically (--single-transaction):
   * any failure rolls back, so a bad file can never leave a half-restored DB.
   */
  async restoreDump(path: string): Promise<void> {
    // Reject anything that is not a readable custom-format dump before we touch
    // the live database.
    try {
      await this.run(this.resolveBin('pg_restore'), ['--list', path]);
    } catch {
      throw new BadRequestException(
        'That file is not a valid KJ backup. Upload a .dump produced by this app.',
      );
    }
    // Drop our pooled connections first. `--clean` recreates every table, and a
    // pooled connection holds cached query plans bound to the *old* tables — the
    // next query through one fails with "cached plan must not change result
    // type" even though the restore itself succeeded.
    await this.prisma.$disconnect().catch(() => undefined);

    try {
      await this.run(this.resolveBin('pg_restore'), [
        `--dbname=${this.dbUrl()}`,
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-privileges',
        '--single-transaction',
        path,
      ]);
    } catch (e) {
      this.logger.error(`Restore failed: ${(e as Error).message}`);
      throw new InternalServerErrorException(`Restore failed: ${(e as Error).message}`);
    } finally {
      // Reconnect either way, so the app can serve this response and keep
      // working against the restored database.
      await this.prisma.$connect().catch((e) => {
        this.logger.warn(`Could not reconnect after restore: ${(e as Error).message}`);
      });
    }
  }
}
