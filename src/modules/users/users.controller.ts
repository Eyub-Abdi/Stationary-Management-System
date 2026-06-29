import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Permission } from '../../common/decorators/permission.decorator';
import { AuditService } from '../audit/audit.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@Permission('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a staff/admin user' })
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const user = await this.users.create(dto, actor.role === 'ADMIN');
    await this.audit.record({
      userId: actor.id,
      action: 'USER_CREATED',
      entityType: 'User',
      entityId: user.id,
      metadata: { email: user.email, role: user.role },
    });
    return user;
  }

  @Get()
  @ApiOperation({ summary: 'List users' })
  findAll(@Query() query: UserQueryDto) {
    return this.users.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user by id' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a user' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const user = await this.users.update(id, dto, actor.role === 'ADMIN');
    await this.audit.record({
      userId: actor.id,
      action: 'USER_UPDATED',
      entityType: 'User',
      entityId: id,
      metadata: { changes: dto },
    });
    return user;
  }

  @Patch(':id/activate')
  @ApiOperation({ summary: 'Activate a user' })
  async activate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const user = await this.users.setActive(id, true, actor.role === 'ADMIN');
    await this.audit.record({
      userId: actor.id,
      action: 'USER_ACTIVATED',
      entityType: 'User',
      entityId: id,
    });
    return user;
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate a user' })
  async deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const user = await this.users.setActive(id, false, actor.role === 'ADMIN');
    await this.audit.record({
      userId: actor.id,
      action: 'USER_DEACTIVATED',
      entityType: 'User',
      entityId: id,
    });
    return user;
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Permanently delete a user (admin, only if no activity history)',
  })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const before = await this.users.findOne(id);
    const result = await this.users.remove(id, actor.id, actor.role === 'ADMIN');
    await this.audit.record({
      userId: actor.id,
      action: 'USER_DELETED',
      entityType: 'User',
      entityId: id,
      metadata: { email: before.email, role: before.role },
    });
    return result;
  }

  @Patch(':id/password')
  @ApiOperation({ summary: 'Reset a user password (admin)' })
  async changePassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangePasswordDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    await this.users.changePassword(id, dto.newPassword, actor.role === 'ADMIN');
    await this.audit.record({
      userId: actor.id,
      action: 'USER_PASSWORD_RESET',
      entityType: 'User',
      entityId: id,
    });
    return { message: 'Password updated; user sessions revoked.' };
  }
}
