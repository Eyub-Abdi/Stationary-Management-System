import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BackupService } from './backup.service';

/** How often we check whether a daily backup is due. */
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
/** A new automatic backup is due once the last one is older than this. */
const BACKUP_DUE_MS = 23 * 60 * 60 * 1000; // ~daily
/** Wait a moment after boot before the first check, so startup isn't slowed. */
const INITIAL_DELAY_MS = 60 * 1000;

/**
 * Runs the on-disk database backup automatically when enabled in Settings.
 * A lightweight in-process timer (no external scheduler/cron dependency, suited
 * to the single-machine till deployment) checks periodically and triggers a
 * backup once a day. Errors are logged and recorded on the settings row.
 */
@Injectable()
export class AutoBackupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutoBackupService.name);
  private timer?: NodeJS.Timeout;
  private initial?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly backup: BackupService,
  ) {}

  onModuleInit(): void {
    this.initial = setTimeout(() => void this.check(), INITIAL_DELAY_MS);
    this.timer = setInterval(() => void this.check(), CHECK_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.initial) clearTimeout(this.initial);
    if (this.timer) clearInterval(this.timer);
  }

  /** Backs up if auto-backup is on and the last run is a day old (or never). */
  private async check(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const s = await this.prisma.appSetting.findUnique({ where: { id: 'singleton' } });
      if (!s?.autoBackupEnabled) return;
      const last = s.lastBackupAt ? s.lastBackupAt.getTime() : 0;
      if (Date.now() - last < BACKUP_DUE_MS) return;
      this.logger.log('Automatic backup is due — running.');
      await this.backup.runLocalBackup();
    } catch (e) {
      // runLocalBackup already records the failure; just avoid crashing the timer.
      this.logger.error(`Automatic backup failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
