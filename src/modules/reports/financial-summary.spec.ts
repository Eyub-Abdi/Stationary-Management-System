import { Prisma, StockAdjustmentReason } from '@prisma/client';
import { ReportsService } from './reports.service';
import { ReportRangeDto } from './dto/report-query.dto';

/**
 * The bottom line, and the one rule it kept getting wrong.
 *
 * `stockLoss = writtenOff - writtenOn` is right for trading: stock found on a
 * recount genuinely offsets stock lost on another. It was catastrophic for
 * setup, because the shelf a shop opens with is not stock that reappeared. A
 * 74m opening entered as a positive adjustment came through as minus 74m of
 * wastage and therefore 74m of profit that was never earned.
 *
 * These tests hold a small ledger of adjustments in memory and let the service
 * filter it, so the assertion is about which rows reach the profit figures
 * rather than about the SQL that fetches them.
 */
describe('ReportsService.financialSummary', () => {
  interface Row {
    reasonCode: StockAdjustmentReason;
    quantityChange: number;
    costImpact: number;
  }

  const build = (rows: Row[], sales = { total: 0, cogs: 0 }) => {
    const aggregate = jest.fn().mockImplementation(({ where }) => {
      // Only the two filters financialSummary applies: the sign of the change,
      // and whether the reason counts as trading.
      const wantsOpening = where.reasonCode?.not !== StockAdjustmentReason.OPENING_STOCK;
      const sign = where.quantityChange?.lt !== undefined ? -1 : 1;
      const sum = rows
        .filter((r) => (wantsOpening ? true : r.reasonCode !== 'OPENING_STOCK'))
        .filter((r) => Math.sign(r.quantityChange) === sign)
        .reduce((a, r) => a + r.costImpact, 0);
      return Promise.resolve({ _sum: { costImpact: new Prisma.Decimal(sum) } });
    });

    const prisma = {
      sale: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: {
            total: new Prisma.Decimal(sales.total),
            totalCogs: new Prisma.Decimal(sales.cogs),
          },
          _count: 0,
        }),
      },
      expense: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: new Prisma.Decimal(0) } }),
      },
      saleReturn: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: {
            totalRefund: new Prisma.Decimal(0),
            totalCogsReversed: new Prisma.Decimal(0),
          },
        }),
      },
      inventoryAdjustment: { aggregate },
    };

    return new ReportsService(prisma as never, {} as never);
  };

  const range = new ReportRangeDto();

  it('leaves opening stock out of wastage and out of profit', async () => {
    // A shop setting up: 74m of stock on the shelf, nothing sold, nothing spoiled.
    const service = build([
      {
        reasonCode: StockAdjustmentReason.OPENING_STOCK,
        quantityChange: 2000,
        costImpact: 74_000_000,
      },
    ]);

    const summary = await service.financialSummary(range);

    expect(summary.stockWrittenOn).toBe('0.00');
    expect(summary.stockLoss).toBe('0.00');
    // The figure the shop actually saw before this: 74,000,000.00.
    expect(summary.netProfit).toBe('0.00');
  });

  it('still nets stock found on a recount against stock written off', async () => {
    // The behaviour opening stock was wrongly borrowing. 5,000 spoiled, 2,000
    // found again: a real 3,000 of loss.
    const service = build([
      { reasonCode: StockAdjustmentReason.DAMAGED, quantityChange: -50, costImpact: -5000 },
      { reasonCode: StockAdjustmentReason.FOUND, quantityChange: 20, costImpact: 2000 },
    ]);

    const summary = await service.financialSummary(range);

    expect(summary.stockWrittenOff).toBe('5000.00');
    expect(summary.stockWrittenOn).toBe('2000.00');
    expect(summary.stockLoss).toBe('3000.00');
    expect(summary.netProfit).toBe('-3000.00');
  });

  it('does not let opening stock cancel out real wastage', async () => {
    // Both in one period, which is what a shop that set up and then jammed a
    // printer in the same month has. The jam must still cost 5,000.
    const service = build([
      {
        reasonCode: StockAdjustmentReason.OPENING_STOCK,
        quantityChange: 2000,
        costImpact: 74_000_000,
      },
      { reasonCode: StockAdjustmentReason.JAM, quantityChange: -50, costImpact: -5000 },
    ]);

    const summary = await service.financialSummary(range);

    expect(summary.stockLoss).toBe('5000.00');
    expect(summary.netProfit).toBe('-5000.00');
  });
});
