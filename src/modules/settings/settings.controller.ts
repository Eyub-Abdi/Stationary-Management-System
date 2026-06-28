import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditService } from '../audit/audit.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { SettingsService } from './settings.service';

/**
 * Application settings (shop branding). Readable by any signed-in user so the
 * UI can render the shop name; editable by admins only.
 */
@ApiTags('Settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get application settings (shop name, branch).' })
  get() {
    return this.settings.get();
  }

  @Patch()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update application settings (admin).' })
  async update(@Body() dto: UpdateSettingsDto, @CurrentUser() user: AuthenticatedUser) {
    const setting = await this.settings.update(dto);
    await this.audit.record({
      userId: user.id,
      action: 'SETTINGS_UPDATED',
      entityType: 'AppSetting',
      entityId: setting.id,
      metadata: { businessName: setting.businessName, branchName: setting.branchName },
    });
    return setting;
  }
}
