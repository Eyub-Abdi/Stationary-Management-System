import { Prisma } from '@prisma/client';
import { CashService } from './cash.service';

/**
 * Unit tests for the cash-drawer reconciliation math. We mock the Prisma client
 * (just the aggregates computeBreakdown reads) and assert the expected-cash
 * formula, including the money-sensitive rules:
 *   - credit sales only contribute the cash actually paid (amountPaid),
 *   - refunds applied to a customer's credit balance don't leave the till,
 *   - cash purchases and supplier payments are outflows.
 */
describe('CashService.computeBreakdown', () => {
  const D = (n: number) => new Prisma.Decimal(n);

  interface Scenario {
    opening: number;
    cashSales: number; // sum of sale.amountPaid
    customerPayments: number;
    deposits: number;
    withdrawals: number;
    expenses: number;
    refundTotal: number;
    creditApplied: number;
    purchases: number; // sum of purchase.amountPaid
    supplierPayments: number;
  }

  const makeClient = (s: Scenario) =>
    ({
      cashSession: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ openingBalance: D(s.opening) }),
      },
      sale: { aggregate: jest.fn().mockResolvedValue({ _sum: { amountPaid: D(s.cashSales) } }) },
      customerPayment: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: D(s.customerPayments) } }),
      },
      cashMovement: {
        aggregate: jest.fn().mockImplementation(({ where }) =>
          Promise.resolve({
            _sum: { amount: D(where.type === 'DEPOSIT' ? s.deposits : s.withdrawals) },
          }),
        ),
      },
      expense: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: D(s.expenses) } }) },
      saleReturn: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { totalRefund: D(s.refundTotal), creditApplied: D(s.creditApplied) },
        }),
      },
      purchase: { aggregate: jest.fn().mockResolvedValue({ _sum: { amountPaid: D(s.purchases) } }) },
      supplierPayment: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: D(s.supplierPayments) } }),
      },
    }) as unknown as Prisma.TransactionClient;

  const compute = (s: Scenario) => {
    const service = new CashService({} as never, {} as never);
    // computeBreakdown is private; exercise it directly with a mocked client.
    return (service as never as { computeBreakdown: Function }).computeBreakdown(
      makeClient(s),
      'session-1',
    ) as Promise<Record<string, string>>;
  };

  it('applies the full inflow/outflow formula', async () => {
    const b = await compute({
      opening: 50000,
      cashSales: 30000,
      customerPayments: 5000,
      deposits: 2000,
      withdrawals: 1000,
      expenses: 1500,
      refundTotal: 4000,
      creditApplied: 1000, // → only 3000 cash refunded
      purchases: 8000,
      supplierPayments: 2500,
    });

    // 87000 inflow − 16000 outflow = 71000
    expect(b.expectedAmount).toBe('71000.00');
    expect(b.cashSales).toBe('30000.00');
    expect(b.refunds).toBe('3000.00'); // net of credit-applied
    expect(b.purchases).toBe('8000.00');
    expect(b.supplierPayments).toBe('2500.00');
  });

  it('counts only the cash paid on credit sales, not the full total', async () => {
    // A credit sale of 21,500 with a 10,000 down payment contributes 10,000.
    const b = await compute({
      opening: 0,
      cashSales: 10000,
      customerPayments: 0,
      deposits: 0,
      withdrawals: 0,
      expenses: 0,
      refundTotal: 0,
      creditApplied: 0,
      purchases: 0,
      supplierPayments: 0,
    });
    expect(b.expectedAmount).toBe('10000.00');
  });

  it('does not drain the till when a refund is applied to store credit', async () => {
    // Refund of 4000 fully applied to the customer's balance → 0 cash out.
    const b = await compute({
      opening: 20000,
      cashSales: 0,
      customerPayments: 0,
      deposits: 0,
      withdrawals: 0,
      expenses: 0,
      refundTotal: 4000,
      creditApplied: 4000,
      purchases: 0,
      supplierPayments: 0,
    });
    expect(b.refunds).toBe('0.00');
    expect(b.expectedAmount).toBe('20000.00');
  });

  it('treats cash purchases as a till outflow', async () => {
    const b = await compute({
      opening: 100000,
      cashSales: 0,
      customerPayments: 0,
      deposits: 0,
      withdrawals: 0,
      expenses: 0,
      refundTotal: 0,
      creditApplied: 0,
      purchases: 35000,
      supplierPayments: 0,
    });
    expect(b.expectedAmount).toBe('65000.00');
  });
});
