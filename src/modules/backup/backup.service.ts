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

type PgTool = 'pg_dump' | 'pg_restore' | 'psql';

export interface LocalBackupResult {
  dir: string;
  filename: string;
  path: string;
  sizeBytes: number;
}

/** What a dump file contains, read without restoring it. */
export interface DumpInspection {
  /** Migrations recorded inside the dump, oldest first. */
  migrations: string[];
  latestMigration: string | null;
  /** Migrations this app has that the dump does not — it predates them. */
  missingMigrations: string[];
  /** True when restoring would roll the schema back. */
  isBehind: boolean;
  tableCount: number;
  /** Set when the post-restore `migrate deploy` failed. The data is restored;
   *  the schema still needs bringing up to date by hand. */
  migrationError?: string;
}

export interface BackupFileInfo {
  filename: string;
  path: string;
  sizeBytes: number;
  /** File modification time — the real local clock time it was written. */
  takenAt: Date;
  inspection: DumpInspection | null;
  /** Set when the file could not be read as a dump. */
  error?: string;
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

  /**
   * Runs a tool, resolving on exit 0 and rejecting with stderr otherwise.
   * Pass `captureStdout` when the tool's output is the thing you want.
   */
  private run(bin: string, args: string[], captureStdout = false): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, { windowsHide: true });
      let stderr = '';
      let stdout = '';
      if (captureStdout) child.stdout.on('data', (d) => (stdout += d.toString()));
      child.stderr.on('data', (d) => (stderr += d.toString()));
      child.on('error', (e) =>
        reject(
          new InternalServerErrorException(
            `Could not run ${bin}. Is PostgreSQL installed? (${e.message})`,
          ),
        ),
      );
      child.on('close', (code) =>
        code === 0
          ? resolve(captureStdout ? stdout : stderr)
          : reject(new Error(stderr.trim() || `${bin} exited ${code}`)),
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

  /**
   * Reads what a dump contains without restoring it: the migration history it
   * carries, and whether that is behind the migrations this build expects.
   *
   * Restoring a dump that predates the current schema rolls the database back,
   * and the running app — whose Prisma client is generated for the *current*
   * schema — then fails on every query for a column that no longer exists.
   * Knowing this up front is what lets the UI warn instead of bricking login.
   */
  async inspectDump(path: string): Promise<DumpInspection> {
    // Table of contents: cheap, and proves the file is a real dump.
    const toc = await this.run(this.resolveBin('pg_restore'), ['--list', path], true);
    const tableCount = (toc.match(/TABLE public /g) ?? []).length;

    // The migration history lives in _prisma_migrations as data, so pull just
    // that one table out as SQL and read the names from its COPY block.
    let migrations: string[] = [];
    try {
      const sql = await this.run(
        this.resolveBin('pg_restore'),
        ['--data-only', '--table=_prisma_migrations', '--file=-', path],
        true,
      );
      migrations = this.parseMigrationNames(sql);
    } catch {
      // An unreadable history is not fatal — treat it as unknown.
    }

    const known = this.localMigrationNames();
    const inDump = new Set(migrations);
    const missingMigrations = known.filter((m) => !inDump.has(m));

    return {
      migrations,
      latestMigration: migrations.length ? migrations[migrations.length - 1] : null,
      missingMigrations,
      // Only meaningful when we could read a history at all.
      isBehind: migrations.length > 0 && missingMigrations.length > 0,
      tableCount,
    };
  }

  /** Migration folder names shipped with this build, in order. */
  private localMigrationNames(): string[] {
    const dir = join(process.cwd(), 'prisma', 'migrations');
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((n) => /^\d{14}_/.test(n))
      .sort();
  }

  /** Pulls migration_name values out of the _prisma_migrations COPY block. */
  private parseMigrationNames(sql: string): string[] {
    const names: string[] = [];
    let inCopy = false;
    for (const line of sql.split('\n')) {
      if (!inCopy) {
        if (/^COPY public\._prisma_migrations /i.test(line)) inCopy = true;
        continue;
      }
      if (line === '\\.') break;
      // Columns: id, checksum, finished_at, migration_name, ...
      const cols = line.split('\t');
      if (cols.length > 3 && /^\d{14}_/.test(cols[3])) names.push(cols[3]);
    }
    return names.sort();
  }

  /**
   * Every dump in the configured backup folder, newest first, with what each
   * one contains. Lets an admin pick a restore point knowingly.
   */
  async listBackups(): Promise<{ dir: string; files: BackupFileInfo[] }> {
    const dir = await this.effectiveBackupDir();
    if (!existsSync(dir)) return { dir, files: [] };

    const names = readdirSync(dir).filter((n) => n.endsWith('.dump'));
    const files: BackupFileInfo[] = [];

    for (const filename of names) {
      const full = join(dir, filename);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      const base: BackupFileInfo = {
        filename,
        path: full,
        sizeBytes: stat.size,
        takenAt: stat.mtime,
        inspection: null,
      };
      try {
        base.inspection = await this.inspectDump(full);
      } catch (e) {
        base.error = (e as Error).message?.slice(0, 200) || 'Unreadable dump';
      }
      files.push(base);
    }

    files.sort((a, b) => b.takenAt.getTime() - a.takenAt.getTime());
    return { dir, files };
  }

  /** Resolves a filename inside the backup folder, rejecting path traversal. */
  async resolveBackupFile(filename: string): Promise<string> {
    if (!/^[\w.-]+\.dump$/.test(filename)) {
      throw new BadRequestException('Invalid backup filename.');
    }
    const dir = await this.effectiveBackupDir();
    const full = join(dir, filename);
    if (!full.startsWith(dir) || !existsSync(full)) {
      throw new BadRequestException('That backup file was not found.');
    }
    return full;
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
  async restoreDump(path: string, acknowledgeOlder = false): Promise<DumpInspection> {
    // Reject anything that is not a readable custom-format dump before we touch
    // the live database.
    let inspection: DumpInspection;
    try {
      inspection = await this.inspectDump(path);
    } catch {
      throw new BadRequestException(
        'That file is not a valid KJ backup. Upload a .dump produced by this app.',
      );
    }

    // A backup from before the current schema rolls the database back. The app
    // keeps running against the *new* Prisma client, so every query then fails
    // on a column that no longer exists — which is how a restore takes down
    // login. Refuse unless the admin has been shown this and accepted it.
    if (inspection.isBehind && !acknowledgeOlder) {
      const n = inspection.missingMigrations.length;
      throw new BadRequestException(
        `This backup was taken before ${n} of the current database change${
          n === 1 ? '' : 's'
        } (oldest missing: ${inspection.missingMigrations[0]}). Restoring it will roll the database back. Confirm you want to restore an older backup to continue.`,
      );
    }
    // Drop our pooled connections first. `--clean` recreates every table, and a
    // pooled connection holds cached query plans bound to the *old* tables — the
    // next query through one fails with "cached plan must not change result
    // type" even though the restore itself succeeded.
    await this.prisma.$disconnect().catch(() => undefined);

    try {
      await this.replaceDatabase(path);
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

    // Bring the restored database up to the schema this build expects, so the
    // app is never left querying tables and columns the dump did not have.
    // A failure here is reported, not thrown: the restore has already
    // committed, and calling that "Restore failed" would be the same lie this
    // endpoint used to tell.
    if (inspection.missingMigrations.length) {
      inspection.migrationError = await this.applyPendingMigrations();
    }

    return inspection;
  }

  /**
   * Runs `prisma migrate deploy` against the restored database. Without this an
   * older backup leaves the schema behind the running code, and every request
   * fails until someone runs it by hand.
   */
  private async applyPendingMigrations(): Promise<string | undefined> {
    try {
      await new Promise<void>((resolve, reject) => {
        const isWin = process.platform === 'win32';
        // Node refuses to spawn .cmd shims without a shell; the arguments here
        // are fixed constants, so there is nothing injectable.
        const child = spawn('npx', ['prisma', 'migrate', 'deploy'], {
          cwd: process.cwd(),
          windowsHide: true,
          shell: isWin,
          // The Prisma CLI loads .env, which otherwise wins over the inherited
          // value — the migration would land on whatever database .env names
          // rather than the one just restored. Pass it explicitly so both steps
          // always target the same database.
          env: { ...process.env, DATABASE_URL: this.dbUrl() },
        });
        let stderr = '';
        child.stderr.on('data', (d) => (stderr += d.toString()));
        child.on('error', (e) => reject(e));
        child.on('close', (code) =>
          code === 0 ? resolve() : reject(new Error(stderr.trim() || `migrate exited ${code}`)),
        );
      });
      this.logger.log('Applied pending migrations after restore.');
      return undefined;
    } catch (e) {
      const msg = (e as Error).message?.slice(0, 300) ?? 'unknown error';
      this.logger.error(`Migrations after restore failed: ${msg}`);
      return `The data was restored, but bringing the database schema up to date failed: ${msg} — run "npx prisma migrate deploy" before using the app.`;
    }
  }

  /**
   * Replaces the database contents in a single transaction: the public schema
   * is dropped and recreated, then the dump is applied over the clean slate.
   *
   * `pg_restore --clean` cannot be used for this. It only drops the objects the
   * dump knows about, so anything added by a migration that ran *after* the
   * backup was taken survives — and a leftover foreign key onto a restored
   * table blocks the drop outright:
   *
   *   cannot drop constraint users_pkey on table public.users because other
   *   objects depend on it
   *
   * DDL is transactional in PostgreSQL, so wrapping the schema reset and the
   * restore together means a failure at any point rolls the whole thing back
   * and the current data is left exactly as it was.
   */
  private async replaceDatabase(dumpPath: string): Promise<void> {
    if (!existsSync(BACKUP_TMP_DIR)) mkdirSync(BACKUP_TMP_DIR, { recursive: true });
    const sqlPath = join(BACKUP_TMP_DIR, `restore_${Date.now()}.sql`);

    try {
      // Convert to plain SQL as a separate, checked step: a truncated or
      // unreadable dump fails here, before anything touches the database.
      await this.run(this.resolveBin('pg_restore'), [
        '--no-owner',
        '--no-privileges',
        '--file',
        sqlPath,
        dumpPath,
      ]);

      await this.run(this.resolveBin('psql'), [
        `--dbname=${this.dbUrl()}`,
        '--single-transaction',
        '--set',
        'ON_ERROR_STOP=1',
        '--command',
        'DROP SCHEMA public CASCADE; CREATE SCHEMA public;',
        '--file',
        sqlPath,
      ]);
    } finally {
      if (existsSync(sqlPath)) unlinkSync(sqlPath);
    }
  }
}
