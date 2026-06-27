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
import {
  CreateServiceDto,
  CreateServiceVariantDto,
  UpdateServiceDto,
  UpdateServiceVariantDto,
} from './dto/service.dto';
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
  @ApiQuery({ name: 'search', required: false, type: String })
  findAll(
    @Query('includeInactive', new ParseBoolPipe({ optional: true }))
    includeInactive?: boolean,
    @Query('search') search?: string,
  ) {
    return this.services.findAll(includeInactive, search?.trim() || undefined);
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

  // ---- Variants (priced options) ------------------------------------------

  @Roles(Role.ADMIN)
  @Post(':id/variants')
  @ApiOperation({ summary: 'Add a priced option to a service (admin)' })
  async addVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateServiceVariantDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const variant = await this.services.addVariant(id, dto);
    await this.audit.record({
      userId: actor.id,
      action: 'SERVICE_VARIANT_CREATED',
      entityType: 'ServiceVariant',
      entityId: variant.id,
      metadata: { serviceId: id, label: variant.label },
    });
    return variant;
  }

  @Roles(Role.ADMIN)
  @Patch('variants/:variantId')
  @ApiOperation({ summary: 'Update a service option (admin)' })
  async updateVariant(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: UpdateServiceVariantDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const variant = await this.services.updateVariant(variantId, dto);
    await this.audit.record({
      userId: actor.id,
      action: 'SERVICE_VARIANT_UPDATED',
      entityType: 'ServiceVariant',
      entityId: variantId,
      metadata: { changes: dto },
    });
    return variant;
  }

  @Roles(Role.ADMIN)
  @Delete('variants/:variantId')
  @ApiOperation({ summary: 'Deactivate a service option (soft)' })
  async deactivateVariant(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const variant = await this.services.deactivateVariant(variantId);
    await this.audit.record({
      userId: actor.id,
      action: 'SERVICE_VARIANT_DEACTIVATED',
      entityType: 'ServiceVariant',
      entityId: variantId,
    });
    return variant;
  }

  @Roles(Role.ADMIN)
  @Delete('variants/:variantId/permanent')
  @ApiOperation({ summary: 'Permanently delete a service option (admin)' })
  async removeVariant(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const result = await this.services.removeVariant(variantId);
    await this.audit.record({
      userId: actor.id,
      action: 'SERVICE_VARIANT_DELETED',
      entityType: 'ServiceVariant',
      entityId: variantId,
    });
    return result;
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
