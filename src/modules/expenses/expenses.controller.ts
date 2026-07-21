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
import { Role } from '@prisma/client';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Permission } from '../../common/decorators/permission.decorator';
import {
  CreateExpenseDto,
  ExpenseQueryDto,
  UpdateExpenseDto,
} from './dto/expense.dto';
import {
  CreateOfficePurchaseDto,
  OfficePurchaseQueryDto,
} from './dto/office-purchase.dto';
import { ExpensesService } from './expenses.service';

@ApiTags('Expenses')
@ApiBearerAuth()
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Post()
  @ApiOperation({
    summary: 'Record an expense. Staff are limited to petty-cash categories.',
  })
  create(@Body() dto: CreateExpenseDto, @CurrentUser() user: AuthenticatedUser) {
    return this.expenses.create(dto, user.id, user.role === Role.ADMIN);
  }

  @Get()
  @ApiOperation({
    summary: 'List expenses. Staff only see petty-cash categories.',
  })
  findAll(@Query() query: ExpenseQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.expenses.findAll(query, user.role === Role.ADMIN);
  }

  @Get('daily')
  @ApiOperation({ summary: 'Per-day expense totals (count + total) for a date range' })
  daily(@Query() query: ExpenseQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.expenses.daily(query, user.role === Role.ADMIN);
  }

  @Post('office')
  @Permission('officePurchases')
  @ApiOperation({
    summary: 'Record an itemized office/internal-use purchase (booked as a cost, not stock).',
  })
  createOfficePurchase(
    @Body() dto: CreateOfficePurchaseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.expenses.createOfficePurchase(dto, user.id);
  }

  @Get('office')
  @Permission('officePurchases')
  @ApiOperation({ summary: 'List office/internal-use purchases with their line items.' })
  findOfficePurchases(@Query() query: OfficePurchaseQueryDto) {
    return this.expenses.findOfficePurchases(query);
  }

  @Get('office/:id')
  @Permission('officePurchases')
  @ApiOperation({ summary: 'Fetch a single office/internal-use purchase with its line items.' })
  findOfficePurchase(@Param('id') id: string) {
    return this.expenses.findOneOfficePurchase(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Edit an expense. Staff may only correct their own entries on the day they recorded them; anything in a closed cash session is frozen.',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.expenses.update(id, dto, user.id, user.role === Role.ADMIN);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an expense (same rules as editing).' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.expenses.remove(id, user.id, user.role === Role.ADMIN);
  }
}
