import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Permission } from '../../common/decorators/permission.decorator';
import { AuditService } from '../audit/audit.service';
import { SetStartupDto } from './dto/startup.dto';
import { SystemService } from './system.service';

/**
 * Host/system controls. Whether the app launches when Windows starts. Technical
 * — the frontend gates this behind a clear warning.
 */
@ApiTags('System')
@ApiBearerAuth()
@Permission('settings')
@Controller('admin/system')
export class SystemController {
  constructor(
    private readonly system: SystemService,
    private readonly audit: AuditService,
  ) {}

  @Get('startup')
  @ApiOperation({ summary: 'Current run-on-startup status (admin).' })
  startupStatus() {
    return this.system.status();
  }

  @Post('startup')
  @ApiOperation({ summary: 'Enable or disable launching the app on Windows startup (admin).' })
  async setStartup(@Body() dto: SetStartupDto, @CurrentUser() user: AuthenticatedUser) {
    const status = this.system.setEnabled(dto.enabled);
    await this.audit.record({
      userId: user.id,
      action: dto.enabled ? 'STARTUP_ENABLED' : 'STARTUP_DISABLED',
      entityType: 'System',
      entityId: 'startup',
      metadata: { serviceName: status.serviceName, enabled: status.enabled },
    });
    return status;
  }
}
