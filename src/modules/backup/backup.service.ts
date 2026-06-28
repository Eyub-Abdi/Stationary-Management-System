import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { spawn } from 'child_process';
import { existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';

/** Temp working area for dumps being produced/uploaded (cleaned up after use). */
export const BACKUP_TMP_DIR = join(process.cwd(), 'backups', 'tmp');

type PgTool = 'pg_dump' | 'pg_restore';

/**
 * Wraps the PostgreSQL client tools to produce and apply custom-format dumps
 * (the same `-Fc` format as scripts/backup.sh). Backups are downloaded by the
 * admin and kept off-server; restore replaces the current database from an
 * uploaded dump. Local, cash-register-style deployment is assumed.
 */
@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

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
    }
  }
}
