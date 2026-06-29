import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Permission } from '../../common/decorators/permission.decorator';
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
  @Permission('settings')
  @ApiOperation({ summary: 'Update application settings (admin, or staff with settings access).' })
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
