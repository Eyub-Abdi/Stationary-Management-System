import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BackupService } from '../backup/backup.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

const SETTINGS_ID = 'singleton';

/** Owner-editable application settings (single row): shop branding + backup config. */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly backup: BackupService,
  ) {}

  /** Returns the settings row (creating it on first access) plus the resolved
   * backup folder, so the UI can show where backups actually go. */
  async get() {
    const row = await this.prisma.appSetting.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID },
      update: {},
    });
    return {
      ...row,
      effectiveBackupDir: row.backupDir?.trim() || this.backup.defaultBackupDir(),
      defaultBackupDir: this.backup.defaultBackupDir(),
    };
  }

  update(dto: UpdateSettingsDto) {
    const data: Prisma.AppSettingUpdateInput = {};
    if (dto.businessName !== undefined) data.businessName = dto.businessName.trim();
    if (dto.branchName !== undefined) data.branchName = dto.branchName.trim();
    if (dto.autoBackupEnabled !== undefined) data.autoBackupEnabled = dto.autoBackupEnabled;
    // `backupTime` widened until the Prisma client is regenerated to include it.
    if (dto.backupTime !== undefined) (data as { backupTime?: string }).backupTime = dto.backupTime;
    if (dto.backupDir !== undefined) data.backupDir = dto.backupDir.trim() || null;
    return this.prisma.appSetting.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...(data as Prisma.AppSettingCreateInput) },
      update: data,
    });
  }
}
