import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { BankService } from './bank.service';
import {
  BankCorrectionDto,
  BankStatementQueryDto,
  HandCorrectionDto,
  IssueLoanDto,
  LoanQueryDto,
  OpeningBalanceDto,
  RepayLoanDto,
  TransferDto,
} from './dto/banking.dto';
import { HandService } from './hand.service';
import { LoansService } from './loans.service';

/**
 * The shop's money away from the counter: what sits in the bank, what is being
 * held at the shop between bank trips, and what shop members have taken for
 * themselves.
 *
 * Everything that moves money is admin-only. Staff get exactly one window in:
 * their own loans, so they can see what they owe.
 */
@ApiTags('Banking')
@ApiBearerAuth()
@Controller()
export class BankingController {
  constructor(
    private readonly bank: BankService,
    private readonly hand: HandService,
    private readonly loans: LoansService,
  ) {}

  // ---- Bank ---------------------------------------------------------------

  @Get('bank/summary')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Current bank balance' })
  bankSummary() {
    return this.bank.summary();
  }

  @Get('bank/statement')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Bank ledger, newest first' })
  statement(@Query() query: BankStatementQueryDto) {
    return this.bank.statement(query);
  }

  @Post('bank/opening-balance')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Record what is in the bank today (once)' })
  openingBalance(
    @Body() dto: OpeningBalanceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bank.setOpeningBalance(dto, user.id);
  }

  @Post('bank/transfer-to-bank')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Move cash from the till to the bank' })
  toBank(@Body() dto: TransferDto, @CurrentUser() user: AuthenticatedUser) {
    return this.bank.transferToBank(dto, user.id);
  }

  @Post('bank/transfer-to-till')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Draw cash from the bank into the till' })
  toTill(@Body() dto: TransferDto, @CurrentUser() user: AuthenticatedUser) {
    return this.bank.transferToTill(dto, user.id);
  }

  @Post('bank/correction')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Adjust the balance after checking a statement' })
  correct(
    @Body() dto: BankCorrectionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bank.correct(dto, user.id);
  }

  // ---- Cash held at the shop ----------------------------------------------

  @Get('hand/summary')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Cash being held outside the till and the bank' })
  handSummary() {
    return this.hand.summary();
  }

  @Get('hand/statement')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Held-cash ledger, newest first' })
  handStatement(@Query() query: BankStatementQueryDto) {
    return this.hand.statement(query);
  }

  @Post('hand/opening-balance')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Record what is already being held today (once)' })
  handOpeningBalance(
    @Body() dto: OpeningBalanceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.hand.setOpeningBalance(dto, user.id);
  }

  @Post('hand/to-bank')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      'Deposit held cash at the bank — the weekly trip. Does not touch the till: the money left it days ago.',
  })
  handToBank(@Body() dto: TransferDto, @CurrentUser() user: AuthenticatedUser) {
    return this.hand.bankHeldCash(dto, user.id);
  }

  @Post('hand/to-till')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Put held cash back into the drawer' })
  handToTill(@Body() dto: TransferDto, @CurrentUser() user: AuthenticatedUser) {
    return this.hand.returnToTill(dto, user.id);
  }

  @Post('hand/correction')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Adjust the figure after counting what is held' })
  handCorrect(
    @Body() dto: HandCorrectionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.hand.correct(dto, user.id);
  }

  // ---- Loans --------------------------------------------------------------

  @Get('loans')
  @ApiOperation({ summary: 'Loans — all of them for an admin, your own as staff' })
  list(@Query() query: LoanQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.loans.findAll(query, user);
  }

  @Get('loans/summary')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Who owes what, and what is overdue' })
  loanSummary() {
    return this.loans.summary();
  }

  @Get('loans/:id')
  @ApiOperation({ summary: 'One loan with its repayments' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.loans.findOne(id, user);
  }

  @Post('loans')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Record money taken by a shop member' })
  issue(@Body() dto: IssueLoanDto, @CurrentUser() user: AuthenticatedUser) {
    // Nobody signs off their own borrowing, not even an admin. The record is
    // only worth having if a second person put their name to it.
    if (dto.userId === user.id) {
      throw new BadRequestException(
        'Another admin must record a loan to you, so no one approves their own.',
      );
    }
    return this.loans.issue(dto, user.id);
  }

  @Post('loans/:id/repayments')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Record a repayment against a loan' })
  repay(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RepayLoanDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.loans.repay(id, dto, user.id);
  }
}
