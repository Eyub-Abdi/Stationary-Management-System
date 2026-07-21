import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CreateExpenseCategoryDto,
  UpdateExpenseCategoryDto,
} from './dto/expense-category.dto';
import { ExpenseCategoriesService } from './expense-categories.service';

@ApiTags('Expense Categories')
@ApiBearerAuth()
@Controller('expense-categories')
export class ExpenseCategoriesController {
  constructor(private readonly categories: ExpenseCategoriesService) {}

  @Get()
  @ApiOperation({
    summary: 'List expense categories. Staff see only active petty-cash ones.',
  })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.categories.findAll(user.role === Role.ADMIN);
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.categories.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create an expense category (admin)' })
  create(
    @Body() dto: CreateExpenseCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.categories.create(dto, user.id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Rename, re-icon, archive or re-scope a category (admin)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.categories.update(id, dto, user.id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Delete an unused expense category (admin). Used ones must be archived.',
  })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.categories.remove(id, user.id);
  }
}
