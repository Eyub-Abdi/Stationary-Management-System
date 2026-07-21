import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { money, sub, toPrisma } from '../../common/utils/money';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ClosePeriodDto } from './dto/accounting-period.dto';

/** Inclusive start / exclusive end of a calendar month, in server local time. */
export function monthRange(year: number, month: number) {
  return {
    from: new Date(year, month - 1, 1, 0, 0, 0, 0),
    to: new Date(year, month, 1, 0, 0, 0, 0),
  };
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const periodLabel = (year: number, month: number) =>
  `${MONTH_NAMES[month - 1]} ${year}`;

@Injectable()
export class AccountingPeriodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Computes a month's figures from the underlying entries. Mirrors the
   * financial summary (revenue net of refunds, COGS net of reversals) and adds
   * stock purchases, which the monthly statement reports alongside it.
   */
  async computeFigures(year: number, month: number) {
    const { from, to } = monthRange(year, month);
    const range = { gte: from, lt: to };

    const [sales, returns, expenses, purchases] = await Promise.all([
      this.prisma.sale.aggregate({
        where: { status: 'COMPLETED', createdAt: range },
        _sum: { total: true, totalCogs: true },
        _count: true,
      }),
      this.prisma.saleReturn.aggregate({
        where: { createdAt: range },
        _sum: { totalRefund: true, totalCogsReversed: true },
      }),
      this.prisma.expense.aggregate({
        where: { expenseDate: range },
        _sum: { amount: true },
      }),
      this.prisma.purchase.aggregate({
        where: { purchaseDate: range },
        _sum: { totalCost: true },
      }),
    ]);

    const grossSales = money(sales._sum.total ?? 0);
    const refunds = money(returns._sum.totalRefund ?? 0);
    const revenue = sub(grossSales, refunds);
    const cogs = sub(
      money(sales._sum.totalCogs ?? 0),
      money(returns._sum.totalCogsReversed ?? 0),
    );
    const grossProfit = sub(revenue, cogs);
    const totalExpenses = money(expenses._sum.amount ?? 0);
    const netProfit = sub(grossProfit, totalExpenses);

    return {
      grossSales,
      refunds,
      revenue,
      cogs,
      grossProfit,
      expenses: totalExpenses,
      netProfit,
      purchases: money(purchases._sum.totalCost ?? 0),
      saleCount: sales._count,
    };
  }

  /** Every month that has been closed at least once, newest first. */
  findAll() {
    return this.prisma.accountingPeriod.findMany({
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: { closedBy: { select: { fullName: true } } },
    });
  }

  /**
   * Every month from the first recorded activity to the last finished one, with
   * its status and figures. Drives the closing screen: which months are done,
   * which are waiting, and what each is worth.
   */
  async overview() {
    const first = await this.earliestActivity();
    if (!first) return [];

    const now = new Date();
    // Only whole, finished months are listed — the current one is still moving.
    const lastKey = now.getFullYear() * 12 + now.getMonth(); // previous month
    const firstKey = first.getFullYear() * 12 + first.getMonth() + 1;

    const periods = await this.prisma.accountingPeriod.findMany({
      include: { closedBy: { select: { fullName: true } } },
    });
    const byKey = new Map(periods.map((p) => [p.year * 12 + p.month, p]));

    const rows = [];
    for (let k = lastKey; k >= firstKey; k--) {
      const year = Math.floor((k - 1) / 12);
      const month = ((k - 1) % 12) + 1;
      const period = byKey.get(k);
      const isClosed = period?.status === 'CLOSED';
      const figures = isClosed
        ? {
            revenue: money(period.revenue),
            grossProfit: money(period.grossProfit),
            expenses: money(period.expenses),
            netProfit: money(period.netProfit),
            saleCount: period.saleCount,
          }
        : await this.computeFigures(year, month);

      rows.push({
        year,
        month,
        label: periodLabel(year, month),
        status: period?.status ?? 'OPEN',
        isClosed,
        closedAt: period?.closedAt ?? null,
        closedBy: period?.closedBy?.fullName ?? null,
        revenue: figures.revenue.toFixed(2),
        grossProfit: figures.grossProfit.toFixed(2),
        expenses: figures.expenses.toFixed(2),
        netProfit: figures.netProfit.toFixed(2),
        saleCount: figures.saleCount,
      });
    }
    return rows;
  }

  /**
   * The monthly statement. A closed month reports its snapshot — the figures as
   * they were signed off. An open month is computed live, so it still moves.
   */
  async statement(year: number, month: number) {
    this.assertValidMonth(year, month);
    const period = await this.prisma.accountingPeriod.findUnique({
      where: { year_month: { year, month } },
      include: { closedBy: { select: { fullName: true } } },
    });

    const isClosed = period?.status === 'CLOSED';
    const figures = isClosed
      ? {
          grossSales: money(period.grossSales),
          refunds: money(period.refunds),
          revenue: money(period.revenue),
          cogs: money(period.cogs),
          grossProfit: money(period.grossProfit),
          expenses: money(period.expenses),
          netProfit: money(period.netProfit),
          purchases: money(period.purchases),
          saleCount: period.saleCount,
        }
      : await this.computeFigures(year, month);

    return {
      year,
      month,
      label: periodLabel(year, month),
      status: period?.status ?? 'OPEN',
      isClosed,
      closedAt: period?.closedAt ?? null,
      closedBy: period?.closedBy?.fullName ?? null,
      notes: period?.notes ?? null,
      // A closed month reports what was signed off; this is what the same
      // figures would be today, so any drift is visible rather than silent.
      liveFigures: isClosed ? this.serialize(await this.computeFigures(year, month)) : null,
      ...this.serialize(figures),
    };
  }

  /**
   * Closes a month: snapshots its figures and freezes the entries behind them.
   * Only whole months that have already ended may be closed.
   */
  async close(dto: ClosePeriodDto, userId: string) {
    const { year, month } = dto;
    this.assertValidMonth(year, month);

    const { to } = monthRange(year, month);
    if (to > new Date()) {
      throw new BadRequestException(
        `${periodLabel(year, month)} has not finished yet — you can only close a month once it has ended.`,
      );
    }

    const existing = await this.prisma.accountingPeriod.findUnique({
      where: { year_month: { year, month } },
    });
    if (existing?.status === 'CLOSED') {
      throw new ConflictException(`${periodLabel(year, month)} is already closed.`);
    }

    // Every earlier month must be closed first, so the books close in order and
    // no gap is left behind.
    const gap = await this.firstOpenMonthBefore(year, month);
    if (gap) {
      throw new BadRequestException(
        `Close ${periodLabel(gap.year, gap.month)} first — months must be closed in order.`,
      );
    }

    const f = await this.computeFigures(year, month);
    const data = {
      grossSales: toPrisma(f.grossSales),
      refunds: toPrisma(f.refunds),
      revenue: toPrisma(f.revenue),
      cogs: toPrisma(f.cogs),
      grossProfit: toPrisma(f.grossProfit),
      expenses: toPrisma(f.expenses),
      netProfit: toPrisma(f.netProfit),
      purchases: toPrisma(f.purchases),
      saleCount: f.saleCount,
      notes: dto.notes?.trim() || null,
      status: 'CLOSED' as const,
      closedAt: new Date(),
      closedById: userId,
    };

    const period = await this.prisma.accountingPeriod.upsert({
      where: { year_month: { year, month } },
      create: { year, month, ...data },
      update: data,
    });

    await this.audit.record({
      userId,
      action: 'PERIOD_CLOSED',
      entityType: 'AccountingPeriod',
      entityId: period.id,
      metadata: {
        period: periodLabel(year, month),
        revenue: f.revenue.toFixed(2),
        netProfit: f.netProfit.toFixed(2),
        reclosed: !!existing,
      },
    });

    return period;
  }

  /**
   * Reopens a closed month so corrections can be made. The snapshot is kept —
   * re-closing overwrites it, and the audit log records both events.
   */
  async reopen(year: number, month: number, reason: string, userId: string) {
    this.assertValidMonth(year, month);
    const period = await this.prisma.accountingPeriod.findUnique({
      where: { year_month: { year, month } },
    });
    if (!period || period.status === 'OPEN') {
      throw new NotFoundException(`${periodLabel(year, month)} is not closed.`);
    }

    // Reopening a month while a later one is closed would let its figures move
    // underneath the closed months that follow it.
    const laterClosed = await this.prisma.accountingPeriod.findFirst({
      where: {
        status: 'CLOSED',
        OR: [{ year: { gt: year } }, { year, month: { gt: month } }],
      },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });
    if (laterClosed) {
      throw new BadRequestException(
        `Reopen ${periodLabel(laterClosed.year, laterClosed.month)} first — later months must be reopened before earlier ones.`,
      );
    }

    const updated = await this.prisma.accountingPeriod.update({
      where: { id: period.id },
      data: { status: 'OPEN', reopenedAt: new Date() },
    });

    await this.audit.record({
      userId,
      action: 'PERIOD_REOPENED',
      entityType: 'AccountingPeriod',
      entityId: period.id,
      metadata: {
        period: periodLabel(year, month),
        reason,
        snapshotNetProfit: period.netProfit.toString(),
      },
    });

    return updated;
  }

  // ---- The lock other modules enforce --------------------------------------

  /**
   * Throws if `date` falls inside a closed month. Called by every write that
   * would change a month's reported figures (expenses, voids, backdated
   * purchases). `what` names the entry in the error the user sees.
   */
  async assertOpen(date: Date, what: string) {
    const period = await this.prisma.accountingPeriod.findUnique({
      where: {
        year_month: { year: date.getFullYear(), month: date.getMonth() + 1 },
      },
      select: { status: true, year: true, month: true },
    });
    if (period?.status === 'CLOSED') {
      throw new BadRequestException(
        `${periodLabel(period.year, period.month)} has been closed, so ${what} cannot be changed. An administrator must reopen the month first.`,
      );
    }
  }

  // ---- Helpers -------------------------------------------------------------

  /** The earliest month with activity that is still open before (year, month). */
  private async firstOpenMonthBefore(year: number, month: number) {
    const first = await this.earliestActivity();
    if (!first) return null;

    const closed = await this.prisma.accountingPeriod.findMany({
      where: { status: 'CLOSED' },
      select: { year: true, month: true },
    });
    const closedKeys = new Set(closed.map((p) => p.year * 12 + p.month));

    const target = year * 12 + month;
    for (let k = first.getFullYear() * 12 + first.getMonth() + 1; k < target; k++) {
      if (!closedKeys.has(k)) {
        return { year: Math.floor((k - 1) / 12), month: ((k - 1) % 12) + 1 };
      }
    }
    return null;
  }

  /** Date of the first sale or expense on record — where the books begin. */
  private async earliestActivity() {
    const [sale, expense] = await Promise.all([
      this.prisma.sale.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
      this.prisma.expense.findFirst({
        orderBy: { expenseDate: 'asc' },
        select: { expenseDate: true },
      }),
    ]);
    const dates = [sale?.createdAt, expense?.expenseDate].filter(Boolean) as Date[];
    if (!dates.length) return null;
    return dates.reduce((a, b) => (a < b ? a : b));
  }

  private assertValidMonth(year: number, month: number) {
    if (month < 1 || month > 12) {
      throw new BadRequestException('Month must be between 1 and 12.');
    }
    if (year < 2000 || year > 2100) {
      throw new BadRequestException('Year is out of range.');
    }
  }

  private serialize(f: Awaited<ReturnType<AccountingPeriodsService['computeFigures']>>) {
    return {
      grossSales: f.grossSales.toFixed(2),
      refunds: f.refunds.toFixed(2),
      revenue: f.revenue.toFixed(2),
      cogs: f.cogs.toFixed(2),
      grossProfit: f.grossProfit.toFixed(2),
      expenses: f.expenses.toFixed(2),
      netProfit: f.netProfit.toFixed(2),
      purchases: f.purchases.toFixed(2),
      saleCount: f.saleCount,
    };
  }
}
