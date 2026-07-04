import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BackupService } from './backup.service';

/** How often we re-check whether the daily backup is due. */
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
/** Wait a moment after boot before the first check, so startup isn't slowed. */
const INITIAL_DELAY_MS = 60 * 1000;
/** Fallback time of day if none/invalid is configured. */
const DEFAULT_TIME = '22:00';

/**
 * Runs the on-disk database backup automatically at a user-chosen time each day.
 *
 * A lightweight in-process timer (no external scheduler/cron dependency, suited
 * to the single-machine till deployment) checks periodically whether a backup is
 * due for the most recent scheduled slot. This design self-heals across downtime:
 * if the machine is switched off at the scheduled time, the first check after it
 * powers back on notices the missed slot and runs the backup immediately, so the
 * day's data is still captured. Errors are logged and recorded on the settings row.
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
    // The initial check catches up a backup missed while the machine was off.
    this.initial = setTimeout(() => void this.check(), INITIAL_DELAY_MS);
    this.timer = setInterval(() => void this.check(), CHECK_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.initial) clearTimeout(this.initial);
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Parses "HH:mm" into [hours, minutes]; falls back to the default on anything
   * malformed, so a bad value can never silently disable backups.
   */
  private parseTime(time: string | null | undefined): [number, number] {
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec((time ?? '').trim());
    if (!m) return [22, 0];
    return [Number(m[1]), Number(m[2])];
  }

  /**
   * The most recent instant the backup was scheduled to run at or before `now`:
   * today at HH:mm if that has already passed, otherwise yesterday's HH:mm.
   */
  private lastScheduled(now: Date, time: string | null | undefined): Date {
    const [hh, mm] = this.parseTime(time);
    const occ = new Date(now);
    occ.setHours(hh, mm, 0, 0);
    if (occ.getTime() > now.getTime()) occ.setDate(occ.getDate() - 1);
    return occ;
  }

  /**
   * Backs up when auto-backup is enabled and nothing has been backed up since the
   * most recent scheduled slot. This one condition covers both the normal daily
   * run and catch-up after downtime: a machine that was off for one day (or
   * several) sees its last backup predate the missed slot and runs once on the
   * next boot; afterwards `lastBackupAt` is newer than the slot, so it won't run
   * again until tomorrow's slot.
   */
  private async check(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const s = await this.prisma.appSetting.findUnique({ where: { id: 'singleton' } });
      if (!s?.autoBackupEnabled) return;
      const backupTime = (s as { backupTime?: string | null }).backupTime ?? DEFAULT_TIME;
      const scheduled = this.lastScheduled(new Date(), backupTime);
      const last = s.lastBackupAt ? s.lastBackupAt.getTime() : 0;
      if (last >= scheduled.getTime()) return; // already backed up since the last slot
      this.logger.log(
        `Automatic backup due (slot ${backupTime}; last ${s.lastBackupAt?.toISOString() ?? 'never'}) — running.`,
      );
      await this.backup.runLocalBackup();
    } catch (e) {
      // runLocalBackup already records the failure; just avoid crashing the timer.
      this.logger.error(`Automatic backup failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
