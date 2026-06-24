import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { paginate } from '../../common/dto/pagination.dto';
import { add, money, sub, toPrisma } from '../../common/utils/money';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CashMovementDto,
  CashSessionQueryDto,
  CloseSessionDto,
  OpenSessionDto,
} from './dto/cash.dto';

export interface CashBreakdown {
  openingBalance: string;
  cashSales: string;
  customerPayments: string;
  deposits: string;
  refunds: string;
  withdrawals: string;
  expenses: string;
  purchases: string;
  supplierPayments: string;
  expectedAmount: string;
}

@Injectable()
export class CashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The cash physically left in the drawer at the end of the last shift — used
   * as the default opening float so staff don't recount it. 0 if none yet.
   */
  async suggestedOpeningFloat() {
    const last = await this.prisma.cashSession.findFirst({
      where: { status: 'CLOSED' },
      orderBy: { closedAt: 'desc' },
      select: { actualAmount: true, closedAt: true },
    });
    return {
      amount: toPrisma(last?.actualAmount ?? 0),
      hasPrevious: !!last,
      from: last?.closedAt ?? null,
    };
  }

  /** Opens a daily cash session. A user may have only one OPEN session. */
  async open(dto: OpenSessionDto, userId: string) {
    const existing = await this.prisma.cashSession.findFirst({
      where: { userId, status: 'OPEN' },
    });
    if (existing) {
      throw new ConflictException(
        'You already have an open cash session. Close it before opening another.',
      );
    }

    // When no float is supplied, carry over the previous shift's counted cash.
    const openingBalance =
      dto.openingBalance != null
        ? toPrisma(dto.openingBalance)
        : (await this.suggestedOpeningFloat()).amount;

    const session = await this.prisma.cashSession.create({
      data: { userId, openingBalance },
    });

    await this.audit.record({
      userId,
      action: 'CASH_SESSION_OPENED',
      entityType: 'CashSession',
      entityId: session.id,
      metadata: { openingBalance: session.openingBalance.toString() },
    });

    return session;
  }

  async addMovement(
    sessionId: string,
    dto: CashMovementDto,
    userId: string,
    isAdmin: boolean,
  ) {
    const session = await this.getOwnedOpenSession(sessionId, userId, isAdmin);

    const movement = await this.prisma.cashMovement.create({
      data: {
        cashSessionId: session.id,
        type: dto.type,
        amount: toPrisma(dto.amount),
        userId,
        notes: dto.notes,
      },
    });

    await this.audit.record({
      userId,
      action: `CASH_${dto.type}`,
      entityType: 'CashSession',
      entityId: session.id,
      metadata: { amount: movement.amount.toString(), notes: dto.notes },
    });

    return movement;
  }

  /**
   * Closes a session under a row lock so no sale can slip in mid-calculation.
   * Computes expected cash, records the counted amount and the variance.
   *
   * Expected = opening + cashSales + deposits - expenses - withdrawals
   */
  async close(
    sessionId: string,
    dto: CloseSessionDto,
    userId: string,
    isAdmin: boolean,
  ) {
    return this.prisma.runSerializable(async (tx) => {
      const locked = await tx.$queryRaw<
        { id: string; userId: string; status: string }[]
      >(Prisma.sql`
        SELECT id, "userId", status FROM cash_sessions WHERE id = ${sessionId}::uuid FOR UPDATE
      `);
      if (locked.length === 0) throw new NotFoundException('Cash session not found');
      const row = locked[0];
      if (!isAdmin && row.userId !== userId) {
        throw new ForbiddenException('You can only close your own session');
      }
      if (row.status !== 'OPEN') {
        throw new ConflictException('Cash session is already closed');
      }

      const breakdown = await this.computeBreakdown(tx, sessionId);
      const expected = money(breakdown.expectedAmount);
      const actual = money(dto.actualAmount);
      const variance = sub(actual, expected);

      const session = await tx.cashSession.update({
        where: { id: sessionId },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          expectedAmount: toPrisma(expected),
          actualAmount: toPrisma(actual),
          variance: toPrisma(variance),
          notes: dto.notes,
        },
      });

      await this.audit.recordTx(tx, {
        userId,
        action: 'CASH_SESSION_CLOSED',
        entityType: 'CashSession',
        entityId: sessionId,
        metadata: {
          ...breakdown,
          actualAmount: actual.toFixed(2),
          variance: variance.toFixed(2),
        },
      });

      return { ...session, breakdown };
    });
  }

  /** Live summary for an open or closed session. */
  async summary(sessionId: string) {
    const session = await this.prisma.cashSession.findUnique({
      where: { id: sessionId },
      include: {
        user: { select: { fullName: true } },
        movements: true,
      },
    });
    if (!session) throw new NotFoundException('Cash session not found');
    const breakdown = await this.computeBreakdown(this.prisma, sessionId);
    return { ...session, breakdown };
  }

  async findAll(query: CashSessionQueryDto) {
    const where: Prisma.CashSessionWhereInput = query.status
      ? { status: query.status }
      : {};
    const [data, total] = await this.prisma.$transaction([
      this.prisma.cashSession.findMany({
        where,
        include: { user: { select: { fullName: true } } },
        orderBy: { openedAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.cashSession.count({ where }),
    ]);
    return paginate(data, total, query.page, query.limit);
  }

  /** Admin variance review: closed sessions whose variance is non-zero. */
  async variances(query: CashSessionQueryDto) {
    const where: Prisma.CashSessionWhereInput = {
      status: 'CLOSED',
      NOT: { variance: 0 },
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.cashSession.findMany({
        where,
        include: { user: { select: { fullName: true } } },
        orderBy: { closedAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.cashSession.count({ where }),
    ]);
    return paginate(data, total, query.page, query.limit);
  }

  // ---- internals ----------------------------------------------------------

  private async getOwnedOpenSession(
    sessionId: string,
    userId: string,
    isAdmin: boolean,
  ) {
    const session = await this.prisma.cashSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('Cash session not found');
    if (!isAdmin && session.userId !== userId) {
      throw new ForbiddenException('Not your cash session');
    }
    if (session.status !== 'OPEN') {
      throw new BadRequestException('Cash session is closed');
    }
    return session;
  }

  private async computeBreakdown(
    client: Prisma.TransactionClient | PrismaService,
    sessionId: string,
  ): Promise<CashBreakdown> {
    const session = await client.cashSession.findUniqueOrThrow({
      where: { id: sessionId },
      select: { openingBalance: true },
    });

    const [sales, custPayments, deposits, withdrawals, expenses, returns, purchases, supPayments] =
      await Promise.all([
        // Only the CASH actually collected at sale time (credit balances excluded).
        client.sale.aggregate({
          where: { cashSessionId: sessionId, status: 'COMPLETED' },
          _sum: { amountPaid: true },
        }),
        client.customerPayment.aggregate({
          where: { cashSessionId: sessionId },
          _sum: { amount: true },
        }),
        client.cashMovement.aggregate({
          where: { cashSessionId: sessionId, type: 'DEPOSIT' },
          _sum: { amount: true },
        }),
        client.cashMovement.aggregate({
          where: { cashSessionId: sessionId, type: 'WITHDRAWAL' },
          _sum: { amount: true },
        }),
        client.expense.aggregate({
          where: { cashSessionId: sessionId },
          _sum: { amount: true },
        }),
        client.saleReturn.aggregate({
          where: { cashSessionId: sessionId },
          _sum: { totalRefund: true, creditApplied: true },
        }),
        // Cash paid out of the till for stock purchases (down payment / full).
        client.purchase.aggregate({
          where: { cashSessionId: sessionId },
          _sum: { amountPaid: true },
        }),
        client.supplierPayment.aggregate({
          where: { cashSessionId: sessionId },
          _sum: { amount: true },
        }),
      ]);

    const opening = money(session.openingBalance);
    const cashSales = money(sales._sum.amountPaid ?? 0);
    const custPay = money(custPayments._sum.amount ?? 0);
    const dep = money(deposits._sum.amount ?? 0);
    const wd = money(withdrawals._sum.amount ?? 0);
    const exp = money(expenses._sum.amount ?? 0);
    // Only the cash portion of refunds leaves the till; credit-applied refunds
    // reduce the customer's balance instead.
    const refunds = sub(
      money(returns._sum.totalRefund ?? 0),
      money(returns._sum.creditApplied ?? 0),
    );
    const purch = money(purchases._sum.amountPaid ?? 0);
    const supPay = money(supPayments._sum.amount ?? 0);

    // Expected = opening + cashSales + customerPayments + deposits
    //            − expenses − withdrawals − refunds − purchases − supplierPayments
    const inflow = add(opening, cashSales, custPay, dep);
    const outflow = add(exp, wd, refunds, purch, supPay);
    const expected: Decimal = sub(inflow, outflow);

    return {
      openingBalance: opening.toFixed(2),
      cashSales: cashSales.toFixed(2),
      customerPayments: custPay.toFixed(2),
      deposits: dep.toFixed(2),
      refunds: refunds.toFixed(2),
      withdrawals: wd.toFixed(2),
      expenses: exp.toFixed(2),
      purchases: purch.toFixed(2),
      supplierPayments: supPay.toFixed(2),
      expectedAmount: expected.toFixed(2),
    };
  }
}
