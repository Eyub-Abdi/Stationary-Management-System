import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { HandTransactionType, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { paginate } from '../../common/dto/pagination.dto';
import { resolveOrderBy, SortMap } from '../../common/utils/sort';
import { money, toPrisma } from '../../common/utils/money';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { requireOpenSession } from '../cash/open-session';
import { BankService } from './bank.service';
import {
  BankStatementQueryDto,
  HandCorrectionDto,
  OpeningBalanceDto,
  TransferDto,
} from './dto/banking.dto';

type Client = Prisma.TransactionClient | PrismaService;

/**
 * Cash the shop is holding outside both the drawer and the bank.
 *
 * Sales are cash into the till, and the till is emptied at close — but the
 * money does not go straight to the bank, because nobody walks to the bank
 * every evening. It sits at the shop for a few days. That is a real place money
 * can be, and until it was recorded here the close subtracted it from the
 * drawer and nothing added it anywhere: the shop's own money went missing from
 * its own reports.
 *
 * Kept as a ledger for the same reason the bank balance is: the balance is the
 * sum of the movements, so it cannot disagree with them. One shop pool, like
 * the till — it records what is held, not who is holding it.
 */
/** Columns the held-cash ledger can be ordered by. */
const HAND_SORTS: SortMap<Prisma.HandTransactionOrderByWithRelationInput[]> = {
  occurredAt: (dir) => [{ occurredAt: dir }, { createdAt: dir }],
  type: (dir) => [{ type: dir }, { occurredAt: 'desc' }],
  notes: (dir) => [{ notes: dir }],
  user: (dir) => [{ user: { fullName: dir } }],
  amount: (dir) => [{ amount: dir }],
};

@Injectable()
export class HandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly bank: BankService,
  ) {}

  /** Balance is the sum of the ledger; there is no stored total to drift. */
  async balance(client: Client = this.prisma): Promise<Decimal> {
    const agg = await client.handTransaction.aggregate({ _sum: { amount: true } });
    return money(agg._sum.amount ?? 0);
  }

  async summary() {
    const [balance, count, lastFromTill, opening] = await Promise.all([
      this.balance(),
      this.prisma.handTransaction.count(),
      this.prisma.handTransaction.findFirst({
        where: { type: 'FROM_TILL' },
        orderBy: { occurredAt: 'desc' },
        select: { occurredAt: true, amount: true },
      }),
      this.prisma.handTransaction.findFirst({
        where: { type: 'OPENING_BALANCE' },
        select: { id: true },
      }),
    ]);
    return {
      balance: balance.toFixed(2),
      transactionCount: count,
      openingBalanceSet: !!opening,
      // "Held since" answers the question the balance provokes: how long has
      // this been sitting here rather than in the bank?
      heldSince: lastFromTill?.occurredAt ?? null,
      lastFromTill: lastFromTill ? money(lastFromTill.amount).toFixed(2) : null,
    };
  }

  async statement(query: BankStatementQueryDto) {
    const [data, total] = await this.prisma.$transaction([
      this.prisma.handTransaction.findMany({
        include: { user: { select: { fullName: true } } },
        orderBy: resolveOrderBy(query, HAND_SORTS, [
          { occurredAt: 'desc' },
          { createdAt: 'desc' },
        ]),
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.handTransaction.count(),
    ]);
    return paginate(data, total, query.page, query.limit);
  }

  /**
   * What was already being held when the ledger began, recorded once — so a
   * shop that has been keeping cash at the shop for months does not have to
   * invent the history to get a correct figure today.
   */
  async setOpeningBalance(dto: OpeningBalanceDto, userId: string) {
    const existing = await this.prisma.handTransaction.findFirst({
      where: { type: 'OPENING_BALANCE' },
    });
    if (existing) {
      throw new ConflictException(
        'An opening held-cash figure is already recorded. Use a correction to adjust it instead.',
      );
    }
    return this.write({
      type: 'OPENING_BALANCE',
      amount: money(dto.amount),
      userId,
      notes: dto.notes,
      action: 'HAND_OPENING_BALANCE_SET',
    });
  }

  /** After counting what is actually held. Signed, and always needs a reason. */
  async correct(dto: HandCorrectionDto, userId: string) {
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
      action: 'HAND_CORRECTED',
    });
  }

  /**
   * The bank trip, finally made. This is the move that had no home before: the
   * cash left the till days ago, so it cannot be withdrawn from today's drawer
   * without reporting a shortage in a drawer that never held it.
   *
   * Deliberately NOT a CashMovement for that reason — the till is not involved
   * at all. Both ledgers are written together instead: out of held cash, into
   * the bank.
   */
  async bankHeldCash(dto: TransferDto, userId: string) {
    const amount = money(dto.amount);
    return this.prisma.runSerializable(async (tx) => {
      await this.assertCovers(tx, amount.negated());

      const bankRow = await this.bank.writeTx(tx, {
        type: 'TRANSFER_IN',
        amount,
        userId,
        notes: dto.notes ? `Held cash banked: ${dto.notes}` : 'Held cash banked',
        action: 'BANK_TRANSFER_IN',
      });

      return this.writeTx(tx, {
        type: 'TO_BANK',
        amount: amount.negated(),
        userId,
        notes: dto.notes,
        bankTxId: bankRow.id,
        action: 'HAND_TO_BANK',
      });
    });
  }

  /**
   * Held cash put back into the drawer — as a float, or because it is needed
   * for change. Here the till IS involved, so this half is an ordinary deposit
   * the close already understands.
   */
  async returnToTill(dto: TransferDto, userId: string) {
    const amount = money(dto.amount);
    return this.prisma.runSerializable(async (tx) => {
      const session = await requireOpenSession(tx, 'putting held cash back');
      await this.assertCovers(tx, amount.negated());

      await tx.cashMovement.create({
        data: {
          cashSessionId: session.id,
          type: 'DEPOSIT',
          amount: toPrisma(amount),
          userId,
          notes: dto.notes ? `From held cash: ${dto.notes}` : 'From held cash',
        },
      });

      return this.writeTx(tx, {
        type: 'TO_TILL',
        amount: amount.negated(),
        userId,
        cashSessionId: session.id,
        notes: dto.notes,
        action: 'HAND_TO_TILL',
      });
    });
  }

  /**
   * A bill paid straight out of the held cash.
   *
   * The alternative was a fiction: return the money to the drawer, then pay it
   * out again — two movements through a till nobody opened, either of which
   * could land in the wrong day's count. This takes the cash where it actually
   * is, and the expense it paid for is recorded as never having touched a till.
   *
   * Must be called inside the same transaction that records the expense, so the
   * cost and the cash it came from can never exist without each other.
   */
  async spendTx(
    tx: Prisma.TransactionClient,
    entry: {
      amount: Decimal;
      userId: string;
      notes?: string | null;
      expenseId?: string | null;
      expensePaymentId?: string | null;
    },
  ) {
    await this.assertCovers(tx, entry.amount.negated());
    return this.writeTx(tx, {
      type: 'SPENT',
      amount: entry.amount.negated(),
      userId: entry.userId,
      notes: entry.notes ?? null,
      expenseId: entry.expenseId,
      expensePaymentId: entry.expensePaymentId,
      action: 'HAND_SPENT',
    });
  }

  /** Refuses a movement that would leave the shop holding less than nothing. */
  async assertCovers(client: Client, delta: Decimal) {
    if (delta.gte(0)) return;
    const balance = await this.balance(client);
    if (balance.plus(delta).lessThan(0)) {
      throw new BadRequestException(
        `Only ${balance.toFixed(2)} is being held; that leaves it short by ${balance
          .plus(delta)
          .abs()
          .toFixed(2)}.`,
      );
    }
  }

  /**
   * The single place a held-cash row is written, so the sign always matches the
   * type and an audit entry always accompanies it.
   */
  async writeTx(
    tx: Prisma.TransactionClient,
    entry: {
      type: HandTransactionType;
      amount: Decimal;
      userId: string;
      notes?: string | null;
      cashSessionId?: string | null;
      bankTxId?: string | null;
      expenseId?: string | null;
      expensePaymentId?: string | null;
      action: string;
    },
  ) {
    const row = await tx.handTransaction.create({
      data: {
        type: entry.type,
        amount: toPrisma(entry.amount),
        userId: entry.userId,
        notes: entry.notes ?? null,
        cashSessionId: entry.cashSessionId ?? null,
        bankTxId: entry.bankTxId ?? null,
        expenseId: entry.expenseId ?? null,
        expensePaymentId: entry.expensePaymentId ?? null,
      },
    });
    await this.audit.recordTx(tx, {
      userId: entry.userId,
      action: entry.action,
      entityType: 'HandTransaction',
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

  private write(entry: Parameters<HandService['writeTx']>[1]) {
    return this.prisma.runSerializable((tx) => this.writeTx(tx, entry));
  }
}
