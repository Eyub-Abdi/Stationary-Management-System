import { Prisma } from '@prisma/client';
import { AccountingPeriodsService, monthRange, periodLabel } from './accounting-periods.service';

/**
 * Unit tests for the month-end close: the figures snapshot, the "close in
 * order" rules that stop gaps appearing in the books, and the lock other
 * modules enforce. Prisma is mocked — no database is touched.
 */
describe('AccountingPeriodsService', () => {
  const D = (n: number) => new Prisma.Decimal(n);

  const build = (over: Record<string, unknown> = {}) => {
    const prisma = {
      sale: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { total: D(100000), totalCogs: D(60000) },
          _count: 12,
        }),
        findFirst: jest.fn().mockResolvedValue({ createdAt: new Date(2026, 3, 5) }), // Apr 2026
      },
      saleReturn: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { totalRefund: D(10000), totalCogsReversed: D(6000) } }),
      },
      expense: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: D(20000) } }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      purchase: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { totalCost: D(30000) } }),
      },
      accountingPeriod: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockImplementation(({ create, update }) =>
          Promise.resolve({ id: 'per1', ...(create ?? update) }),
        ),
        update: jest.fn().mockResolvedValue({ id: 'per1', status: 'OPEN' }),
      },
      ...over,
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new AccountingPeriodsService(prisma as never, audit as never);
    return { service, prisma, audit };
  };

  describe('computeFigures', () => {
    it('nets refunds off revenue and reversals off COGS', async () => {
      const { service } = build();
      const f = await service.computeFigures(2026, 4);

      expect(f.grossSales.toFixed(2)).toBe('100000.00');
      expect(f.refunds.toFixed(2)).toBe('10000.00');
      expect(f.revenue.toFixed(2)).toBe('90000.00'); // 100000 − 10000
      expect(f.cogs.toFixed(2)).toBe('54000.00'); // 60000 − 6000
      expect(f.grossProfit.toFixed(2)).toBe('36000.00'); // 90000 − 54000
      expect(f.netProfit.toFixed(2)).toBe('16000.00'); // 36000 − 20000 expenses
      expect(f.purchases.toFixed(2)).toBe('30000.00');
    });

    it('queries the month as a half-open range so no day is double counted', async () => {
      const { service, prisma } = build();
      await service.computeFigures(2026, 4);

      const where = prisma.sale.aggregate.mock.calls[0][0].where;
      expect(where.createdAt.gte).toEqual(new Date(2026, 3, 1));
      expect(where.createdAt.lt).toEqual(new Date(2026, 4, 1));
    });
  });

  describe('close', () => {
    it('refuses to close a month that has not finished', async () => {
      const { service } = build();
      const now = new Date();
      await expect(
        service.close({ year: now.getFullYear(), month: now.getMonth() + 1 }, 'u1'),
      ).rejects.toThrow(/has not finished/i);
    });

    it('refuses when an earlier month is still open', async () => {
      // Activity starts April 2026; closing June with May still open leaves a gap.
      const { service } = build();
      await expect(service.close({ year: 2026, month: 6 }, 'u1')).rejects.toThrow(
        /close April 2026 first/i,
      );
    });

    it('snapshots the figures once earlier months are closed', async () => {
      const { service, prisma, audit } = build();
      prisma.accountingPeriod.findMany.mockResolvedValue([
        { year: 2026, month: 4 },
        { year: 2026, month: 5 },
      ]);

      await service.close({ year: 2026, month: 6, notes: 'reviewed' }, 'u1');

      const { create } = prisma.accountingPeriod.upsert.mock.calls[0][0];
      expect(create.status).toBe('CLOSED');
      expect(create.netProfit.toString()).toBe('16000');
      expect(create.saleCount).toBe(12);
      expect(create.notes).toBe('reviewed');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PERIOD_CLOSED' }),
      );
    });

    it('rejects an already-closed month', async () => {
      const { service, prisma } = build();
      prisma.accountingPeriod.findUnique.mockResolvedValue({ status: 'CLOSED' });
      await expect(service.close({ year: 2026, month: 6 }, 'u1')).rejects.toThrow(
        /already closed/i,
      );
    });
  });

  describe('reopen', () => {
    it('refuses while a later month is still closed', async () => {
      const { service, prisma } = build();
      prisma.accountingPeriod.findUnique.mockResolvedValue({ id: 'p1', status: 'CLOSED' });
      prisma.accountingPeriod.findFirst.mockResolvedValue({ year: 2026, month: 7 });

      await expect(service.reopen(2026, 6, 'missed invoice', 'u1')).rejects.toThrow(
        /Reopen July 2026 first/i,
      );
    });

    it('reopens and records the reason', async () => {
      const { service, prisma, audit } = build();
      prisma.accountingPeriod.findUnique.mockResolvedValue({
        id: 'p1',
        status: 'CLOSED',
        netProfit: D(16000),
      });

      await service.reopen(2026, 6, 'missed invoice', 'u1');

      expect(prisma.accountingPeriod.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'OPEN' }) }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PERIOD_REOPENED',
          metadata: expect.objectContaining({ reason: 'missed invoice' }),
        }),
      );
    });
  });

  describe('assertOpen', () => {
    it('throws for a date inside a closed month', async () => {
      const { service, prisma } = build();
      prisma.accountingPeriod.findUnique.mockResolvedValue({
        status: 'CLOSED',
        year: 2026,
        month: 6,
      });
      await expect(
        service.assertOpen(new Date(2026, 5, 15), 'this expense'),
      ).rejects.toThrow(/June 2026 has been closed/i);
    });

    it('passes for a month that was reopened', async () => {
      const { service, prisma } = build();
      prisma.accountingPeriod.findUnique.mockResolvedValue({
        status: 'OPEN',
        year: 2026,
        month: 6,
      });
      await expect(
        service.assertOpen(new Date(2026, 5, 15), 'this expense'),
      ).resolves.toBeUndefined();
    });

    it('passes for a month that was never closed', async () => {
      const { service } = build();
      await expect(
        service.assertOpen(new Date(2026, 5, 15), 'this expense'),
      ).resolves.toBeUndefined();
    });
  });

  describe('helpers', () => {
    it('labels and bounds months correctly', () => {
      expect(periodLabel(2026, 1)).toBe('January 2026');
      expect(periodLabel(2026, 12)).toBe('December 2026');
      // December rolls the year over rather than producing month 13.
      expect(monthRange(2026, 12).to).toEqual(new Date(2027, 0, 1));
    });
  });
});
