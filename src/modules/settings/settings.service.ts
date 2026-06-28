import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

const SETTINGS_ID = 'singleton';

/** Owner-editable application settings (single row): shop branding such as name. */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns the settings row, creating it with defaults on first access. */
  get() {
    return this.prisma.appSetting.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID },
      update: {},
    });
  }

  update(dto: UpdateSettingsDto) {
    const data: { businessName?: string; branchName?: string } = {};
    if (dto.businessName !== undefined) data.businessName = dto.businessName.trim();
    if (dto.branchName !== undefined) data.branchName = dto.branchName.trim();
    return this.prisma.appSetting.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...data },
      update: data,
    });
  }
}
