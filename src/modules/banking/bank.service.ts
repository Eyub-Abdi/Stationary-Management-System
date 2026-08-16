import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { BankTransactionType, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { paginate } from '../../common/dto/pagination.dto';
import { money, toPrisma } from '../../common/utils/money';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { assertTillCovers } from '../cash/expected-cash';
import { requireOpenSession } from '../cash/open-session';
import {
  BankCorrectionDto,
  BankStatementQueryDto,
  OpeningBalanceDto,
  TransferDto,
} from './dto/banking.dto';

type Client = Prisma.TransactionClient | PrismaService;

/**
 * The shop's bank balance, kept as a ledger rather than a stored number so it
 * can never disagree with the movements that produced it.
 *
 * Sales are always cash into the till, so money only reaches the bank because
 * someone carried it there. Both halves of such a move are written together:
 * a CashMovement on the open session (which the till reconciliation already
 * understands) and a BankTransaction here. Neither half touches profit — the
 * money has changed pockets, not left the business.
 */
@Injectable()
export class BankService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Balance is the sum of the ledger; there is no stored total to drift. */
  async balance(client: Client = this.prisma): Promise<Decimal> {
    const agg = await client.bankTransaction.aggregate({ _sum: { amount: true } });
    return money(agg._sum.amount ?? 0);
  }

  async summary() {
    const [balance, count, opening] = await Promise.all([
      this.balance(),
      this.prisma.bankTransaction.count(),
      this.prisma.bankTransaction.findFirst({
        where: { type: 'OPENING_BALANCE' },
        select: { id: true },
      }),
    ]);
    return {
      balance: balance.toFixed(2),
      transactionCount: count,
      // Until an opening balance is set the figure is only as old as the app.
      openingBalanceSet: !!opening,
    };
  }

  async statement(query: BankStatementQueryDto) {
    const [data, total] = await this.prisma.$transaction([
      this.prisma.bankTransaction.findMany({
        include: {
          user: { select: { fullName: true } },
          loan: { select: { id: true, user: { select: { fullName: true } } } },
        },
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.bankTransaction.count(),
    ]);
    return paginate(data, total, query.page, query.limit);
  }

  /**
   * The starting point, recorded once. Everything after it is a movement, so a
   * shop that has been trading for months does not have to invent history to
   * get a correct balance today.
   */
  async setOpeningBalance(dto: OpeningBalanceDto, userId: string) {
    const existing = await this.prisma.bankTransaction.findFirst({
      where: { type: 'OPENING_BALANCE' },
    });
    if (existing) {
      throw new ConflictException(
        'An opening balance is already recorded. Use a correction to adjust the balance instead.',
      );
    }
    return this.write({
      type: 'OPENING_BALANCE',
      amount: money(dto.amount),
      userId,
      notes: dto.notes,
      action: 'BANK_OPENING_BALANCE_SET',
    });
  }

  /** Reconciliation against a statement. Signed, and always needs a reason. */
  async correct(dto: BankCorrectionDto, userId: string) {
    const amount = money(dto.amount);
    if (amount.isZero()) {
      throw new BadRequestException('A correction of zero changes nothing.');
    }
    await this.assertCovers(this.prisma, amount);
    return this.write({
      type: 'CORRECTION',
      amount,
      userId,
      notes: dto.reason,
      action: 'BANK_CORRECTED',
    });
  }

  /** Cash carried from the drawer to the bank. */
  async transferToBank(dto: TransferDto, userId: string) {
    const amount = money(dto.amount);
    return this.prisma.runSerializable(async (tx) => {
      const session = await requireOpenSession(tx, 'moving cash to the bank');
      // The bank direction has always checked it can cover the move; the till
      // direction must too, or a mistyped transfer leaves the drawer expecting
      // a negative amount for the rest of the day.
      await assertTillCovers(tx, session.id, amount, 'banking more than it holds');
      await tx.cashMovement.create({
        data: {
          cashSessionId: session.id,
          type: 'WITHDRAWAL',
          amount: toPrisma(amount),
          userId,
          notes: dto.notes ? `To bank: ${dto.notes}` : 'Moved to bank',
        },
      });
      return this.writeTx(tx, {
        type: 'TRANSFER_IN',
        amount,
        userId,
        cashSessionId: session.id,
        notes: dto.notes,
        action: 'BANK_TRANSFER_IN',
      });
    });
  }

  /** Cash drawn back out of the bank into the drawer. */
  async transferToTill(dto: TransferDto, userId: string) {
    const amount = money(dto.amount);
    return this.prisma.runSerializable(async (tx) => {
      const session = await requireOpenSession(tx, 'drawing cash from the bank');
      await this.assertCovers(tx, amount.negated());
      await tx.cashMovement.create({
        data: {
          cashSessionId: session.id,
          type: 'DEPOSIT',
          amount: toPrisma(amount),
          userId,
          notes: dto.notes ? `From bank: ${dto.notes}` : 'Drawn from bank',
        },
      });
      return this.writeTx(tx, {
        type: 'TRANSFER_OUT',
        amount: amount.negated(),
        userId,
        cashSessionId: session.id,
        notes: dto.notes,
        action: 'BANK_TRANSFER_OUT',
      });
    });
  }

  /** Refuses a movement that would push the balance below zero. */
  async assertCovers(client: Client, delta: Decimal) {
    if (delta.gte(0)) return;
    const balance = await this.balance(client);
    if (balance.plus(delta).lessThan(0)) {
      throw new BadRequestException(
        `The bank has ${balance.toFixed(2)}; that leaves it short by ${balance.plus(delta).abs().toFixed(2)}.`,
      );
    }
  }

  /**
   * The single place a bank row is written, so the sign always matches the type
   * and an audit entry always accompanies it.
   */
  async writeTx(
    tx: Prisma.TransactionClient,
    entry: {
      type: BankTransactionType;
      amount: Decimal;
      userId: string;
      notes?: string | null;
      cashSessionId?: string | null;
      loanId?: string | null;
      repaymentId?: string | null;
      action: string;
    },
  ) {
    const row = await tx.bankTransaction.create({
      data: {
        type: entry.type,
        amount: toPrisma(entry.amount),
        userId: entry.userId,
        notes: entry.notes ?? null,
        cashSessionId: entry.cashSessionId ?? null,
        loanId: entry.loanId ?? null,
        repaymentId: entry.repaymentId ?? null,
      },
    });
    await this.audit.recordTx(tx, {
      userId: entry.userId,
      action: entry.action,
      entityType: 'BankTransaction',
      entityId: row.id,
      metadata: {
        type: entry.type,
        amount: entry.amount.toFixed(2),
        balanceAfter: (await this.balance(tx)).toFixed(2),
        notes: entry.notes ?? null,
      },
    });
    return row;
  }

  private write(entry: Parameters<BankService['writeTx']>[1]) {
    return this.prisma.runSerializable((tx) => this.writeTx(tx, entry));
  }
}
