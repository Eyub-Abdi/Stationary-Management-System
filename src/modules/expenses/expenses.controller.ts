import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { CreateExpenseDto, ExpenseQueryDto } from './dto/expense.dto';
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
  @ApiOperation({ summary: 'Record an expense. SALARY is admin-only.' })
  create(@Body() dto: CreateExpenseDto, @CurrentUser() user: AuthenticatedUser) {
    return this.expenses.create(dto, user.id, user.role === Role.ADMIN);
  }

  @Get()
  @ApiOperation({ summary: 'List expenses. Staff never see SALARY entries.' })
  findAll(@Query() query: ExpenseQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.expenses.findAll(query, user.role === Role.ADMIN);
  }

  @Post('office')
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
  @ApiOperation({ summary: 'List office/internal-use purchases with their line items.' })
  findOfficePurchases(@Query() query: OfficePurchaseQueryDto) {
    return this.expenses.findOfficePurchases(query);
  }
}
