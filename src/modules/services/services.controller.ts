import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditService } from '../audit/audit.service';
import { CreateServiceDto, UpdateServiceDto } from './dto/service.dto';
import { ServicesService } from './services.service';

@ApiTags('Services')
@ApiBearerAuth()
@Controller('services')
export class ServicesController {
  constructor(
    private readonly services: ServicesService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List services' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  findAll(
    @Query('includeInactive', new ParseBoolPipe({ optional: true }))
    includeInactive?: boolean,
  ) {
    return this.services.findAll(includeInactive);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.services.findOne(id);
  }

  @Roles(Role.ADMIN)
  @Post()
  @ApiOperation({ summary: 'Create a service (admin)' })
  async create(
    @Body() dto: CreateServiceDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const service = await this.services.create(dto);
    await this.audit.record({
      userId: actor.id,
      action: 'SERVICE_CREATED',
      entityType: 'Service',
      entityId: service.id,
      metadata: { name: service.name },
    });
    return service;
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const service = await this.services.update(id, dto);
    await this.audit.record({
      userId: actor.id,
      action: 'SERVICE_UPDATED',
      entityType: 'Service',
      entityId: id,
      metadata: { changes: dto },
    });
    return service;
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  async deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const service = await this.services.deactivate(id);
    await this.audit.record({
      userId: actor.id,
      action: 'SERVICE_DEACTIVATED',
      entityType: 'Service',
      entityId: id,
    });
    return service;
  }

  @Roles(Role.ADMIN)
  @Patch(':id/reactivate')
  @ApiOperation({ summary: 'Reactivate a deactivated service (admin)' })
  async reactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const service = await this.services.reactivate(id);
    await this.audit.record({
      userId: actor.id,
      action: 'SERVICE_REACTIVATED',
      entityType: 'Service',
      entityId: id,
    });
    return service;
  }

  @Roles(Role.ADMIN)
  @Delete(':id/permanent')
  @ApiOperation({ summary: 'Permanently delete a service (admin)' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const result = await this.services.remove(id);
    await this.audit.record({
      userId: actor.id,
      action: 'SERVICE_DELETED',
      entityType: 'Service',
      entityId: id,
    });
    return result;
  }
}
