import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  ReportRangeDto,
  SalesReportQueryDto,
} from './dto/report-query.dto';
import { ReportsService } from './reports.service';

@ApiTags('Reports')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('sales')
  @ApiOperation({ summary: 'Sales time series (daily/weekly/monthly/custom)' })
  salesSeries(@Query() query: SalesReportQueryDto) {
    return this.reports.salesSeries(query);
  }

  @Get('financial-summary')
  @ApiOperation({ summary: 'Revenue, COGS, gross profit, expenses, net profit' })
  financialSummary(@Query() query: ReportRangeDto) {
    return this.reports.financialSummary(query);
  }

  @Get('expenses-by-category')
  @ApiOperation({ summary: 'Expense totals grouped by category' })
  expensesByCategory(@Query() query: ReportRangeDto) {
    return this.reports.expensesByCategory(query);
  }

  @Get('inventory/stock-levels')
  @ApiOperation({ summary: 'Current stock levels with FIFO valuation' })
  stockLevels() {
    return this.reports.stockLevels();
  }

  @Get('inventory/low-stock')
  @ApiOperation({ summary: 'Products at or below minimum stock' })
  lowStock() {
    return this.reports.lowStock();
  }

  @Get('top-products')
  @ApiOperation({ summary: 'Best-selling products for a range' })
  topProducts(@Query() query: ReportRangeDto) {
    return this.reports.topProducts(query);
  }

  @Get('profitability')
  @ApiOperation({ summary: 'Per-product realized profit (revenue, COGS, margin)' })
  productProfitability(@Query() query: ReportRangeDto) {
    return this.reports.productProfitability(query);
  }

  @Get('cash-sessions')
  @ApiOperation({ summary: 'Cash sessions report (optionally by status)' })
  @ApiQuery({ name: 'status', required: false, enum: ['OPEN', 'CLOSED'] })
  cashSessions(@Query('status') status?: 'OPEN' | 'CLOSED') {
    return this.reports.cashSessions(status);
  }

  @Get('user-activity')
  @ApiOperation({ summary: 'Per-staff sales activity for a range' })
  userActivity(@Query() query: ReportRangeDto) {
    return this.reports.userActivity(query);
  }
}
