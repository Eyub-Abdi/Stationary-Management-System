import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { paginate } from '../../common/dto/pagination.dto';
import { add, money, sub, toPrisma } from '../../common/utils/money';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BankService } from '../banking/bank.service';
import {
  CashMovementDto,
  CashSessionQueryDto,
  CloseSessionDto,
  OpenSessionDto,
} from './dto/cash.dto';
import { CashBreakdown, computeBreakdown } from './expected-cash';

export type { CashBreakdown } from './expected-cash';

@Injectable()
export class CashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly bank: BankService,
  ) {}

  /**
   * The cash physically left in the drawer at the end of the last shift — used
   * as the default opening float so staff don't recount it. 0 if none yet.
   * Sessions closed without a count (e.g. by the migration to a shared till)
   * carry no float, so they're skipped.
   */
  async suggestedOpeningFloat() {
    const last = await this.prisma.cashSession.findFirst({
      where: { status: 'CLOSED', actualAmount: { not: null } },
      orderBy: { closedAt: 'desc' },
      select: { actualAmount: true, closedAt: true, closingWithdrawal: true },
    });
    // What carries over is what stayed in the drawer, not what was counted:
    // cash removed at close went to the bank or home and will not be there in
    // the morning.
    const counted = money(last?.actualAmount ?? 0);
    const withdrawn = money(last?.closingWithdrawal ?? 0);
    return {
      amount: toPrisma(sub(counted, withdrawn)),
      hasPrevious: !!last,
      from: last?.closedAt ?? null,
      counted: counted.toFixed(2),
      withdrawn: withdrawn.toFixed(2),
    };
  }

  /**
   * The one shared till everyone is transacting against, or null when it's
   * closed. Every station reads this instead of remembering a session of its
   * own, so all users always see (and post to) the same drawer.
   */
  async current() {
    const session = await this.prisma.cashSession.findFirst({
      where: { status: 'OPEN' },
      include: { user: { select: { fullName: true } }, movements: true },
      orderBy: { openedAt: 'desc' },
    });
    if (!session) return null;
    const breakdown = await this.computeBreakdown(this.prisma, session.id);
    return { ...session, breakdown };
  }

  /**
   * Opens the shop's cash session. There is exactly one shared till, so only
   * one session may be OPEN at a time no matter who opens it — the database
   * enforces this too (partial unique index on status = 'OPEN').
   */
  async open(dto: OpenSessionDto, userId: string) {
    const existing = await this.prisma.cashSession.findFirst({
      where: { status: 'OPEN' },
      include: { user: { select: { fullName: true } } },
    });
    if (existing) {
      throw new ConflictException(this.alreadyOpenMessage(existing.user.fullName));
    }

    // When no float is supplied, carry over the previous shift's counted cash.
    const openingBalance =
      dto.openingBalance != null
        ? toPrisma(dto.openingBalance)
        : (await this.suggestedOpeningFloat()).amount;

    const session = await this.prisma.cashSession
      .create({ data: { userId, openingBalance } })
      .catch((e: unknown) => {
        // Two people hit "Open Session" at once; the index kept one of them out.
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          throw new ConflictException(this.alreadyOpenMessage());
        }
        throw e;
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

  async addMovement(sessionId: string, dto: CashMovementDto, userId: string) {
    const session = await this.getOpenSession(sessionId);

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
  async close(sessionId: string, dto: CloseSessionDto, userId: string) {
    return this.prisma.runSerializable(async (tx) => {
      const locked = await tx.$queryRaw<
        { id: string; userId: string; status: string }[]
      >(Prisma.sql`
        SELECT id, "userId", status FROM cash_sessions WHERE id = ${sessionId}::uuid FOR UPDATE
      `);
      if (locked.length === 0) throw new NotFoundException('Cash session not found');
      const row = locked[0];
      if (row.status !== 'OPEN') {
        throw new ConflictException('Cash session is already closed');
      }

      const breakdown = await this.computeBreakdown(tx, sessionId);
      const expected = money(breakdown.expectedAmount);
      const actual = money(dto.actualAmount);
      const variance = sub(actual, expected);

      // Cash lifted out of the drawer once it had been counted — banked or taken
      // home overnight. The count above already reconciled the full drawer, so
      // this changes nothing about the variance; it only decides how much is
      // still there tomorrow. Recording it is what keeps the next session's
      // float honest instead of carrying over money that has left the building.
      const withdrawal = money(dto.withdrawal ?? 0);
      if (withdrawal.greaterThan(actual)) {
        throw new BadRequestException(
          `You cannot take out ${withdrawal.toFixed(2)} — only ${actual.toFixed(2)} was counted.`,
        );
      }
      const leftInDrawer = sub(actual, withdrawal);

      const session = await tx.cashSession.update({
        where: { id: sessionId },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          expectedAmount: toPrisma(expected),
          actualAmount: toPrisma(actual),
          variance: toPrisma(variance),
          closingWithdrawal: dto.withdrawal != null ? toPrisma(withdrawal) : null,
          notes: dto.notes,
        },
      });

      // Money leaving the drawer is easiest to account for at the moment it
      // leaves, which is the only moment anyone knows where it is going. Told
      // it went to the bank, we put it on the bank ledger here rather than
      // hoping someone records the trip tomorrow.
      //
      // Deliberately NOT a CashMovement: this happens after the count, so
      // treating it as one would move `expected` and turn a balanced drawer
      // into a variance.
      if (withdrawal.greaterThan(0) && dto.withdrawalTo === 'BANK') {
        await this.bank.writeTx(tx, {
          type: 'TRANSFER_IN',
          amount: withdrawal,
          userId,
          cashSessionId: sessionId,
          notes: 'Banked at close of day',
          action: 'BANK_TRANSFER_IN',
        });
      }

      await this.audit.recordTx(tx, {
        userId,
        action: 'CASH_SESSION_CLOSED',
        entityType: 'CashSession',
        entityId: sessionId,
        metadata: {
          ...breakdown,
          actualAmount: actual.toFixed(2),
          variance: variance.toFixed(2),
          closingWithdrawal: withdrawal.toFixed(2),
          leftInDrawer: leftInDrawer.toFixed(2),
        },
      });

      return { ...session, breakdown };
    });
  }

  /** Live summary for an open or closed session. The till is shared, so anyone
   * signed in may view it. */
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

  /** Lists the shop's sessions — the same history for everyone. */
  async findAll(query: CashSessionQueryDto) {
    const where: Prisma.CashSessionWhereInput = {
      ...(query.status ? { status: query.status } : {}),
    };
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

  private alreadyOpenMessage(openedBy?: string) {
    return openedBy
      ? `The till is already open (opened by ${openedBy}). Everyone shares one cash session — close it before opening another.`
      : 'The till is already open. Everyone shares one cash session — close it before opening another.';
  }

  private async getOpenSession(sessionId: string) {
    const session = await this.prisma.cashSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('Cash session not found');
    if (session.status !== 'OPEN') {
      throw new BadRequestException('Cash session is closed');
    }
    return session;
  }

  private computeBreakdown(
    client: Prisma.TransactionClient | PrismaService,
    sessionId: string,
  ): Promise<CashBreakdown> {
    return computeBreakdown(client, sessionId);
  }
}
