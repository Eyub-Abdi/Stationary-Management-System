import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AccountingPeriodsService } from './accounting-periods.service';
import {
  ClosePeriodDto,
  PeriodParamsDto,
  ReopenPeriodDto,
} from './dto/accounting-period.dto';

@ApiTags('Accounting Periods')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('accounting/periods')
export class AccountingPeriodsController {
  constructor(private readonly periods: AccountingPeriodsService) {}

  @Get()
  @ApiOperation({
    summary: 'Every finished month with its figures and close status.',
  })
  overview() {
    return this.periods.overview();
  }

  @Get('closed')
  @ApiOperation({ summary: 'Months that have been closed.' })
  findAll() {
    return this.periods.findAll();
  }

  @Get('statement')
  @ApiOperation({
    summary:
      'Monthly statement. A closed month reports its snapshot plus what the figures would be today.',
  })
  statement(@Query() query: PeriodParamsDto) {
    return this.periods.statement(query.year, query.month);
  }

  @Post('close')
  @ApiOperation({
    summary: 'Close a finished month: snapshot its figures and freeze its entries.',
  })
  close(@Body() dto: ClosePeriodDto, @CurrentUser() user: AuthenticatedUser) {
    return this.periods.close(dto, user.id);
  }

  @Post(':year/:month/reopen')
  @ApiOperation({ summary: 'Reopen a closed month so corrections can be made.' })
  reopen(
    @Param() params: PeriodParamsDto,
    @Body() dto: ReopenPeriodDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.periods.reopen(params.year, params.month, dto.reason, user.id);
  }
}
