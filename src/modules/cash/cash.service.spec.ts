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
    const service = new CashService({} as never, {} as never, {} as never);
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

/**
 * The shop shares one till, so "is a session already open?" is a question about
 * the shop, never about the person asking.
 */
describe('CashService.open', () => {
  const build = (openSession: unknown, lastClosed: unknown = null) => {
    const findFirst = jest.fn().mockImplementation(({ where }) =>
      Promise.resolve(where.status === 'OPEN' ? openSession : lastClosed),
    );
    const create = jest.fn().mockImplementation(({ data }) =>
      Promise.resolve({ id: 'new-session', ...data }),
    );
    const prisma = { cashSession: { findFirst, create } };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    return {
      service: new CashService(prisma as never, audit as never, {} as never),
      create,
    };
  };

  it('refuses a second session while another user has the till open', async () => {
    const { service, create } = build({
      id: 'sess1',
      user: { fullName: 'Amina' },
    });
    await expect(service.open({}, 'user2')).rejects.toThrow(/already open.*Amina/is);
    expect(create).not.toHaveBeenCalled();
  });

  it('opens with the carried-over float when the till is closed', async () => {
    const { service, create } = build(null, {
      actualAmount: new Prisma.Decimal(62000),
      closedAt: new Date(),
    });
    const session = await service.open({}, 'user2');
    expect(create).toHaveBeenCalled();
    expect(session.openingBalance.toString()).toBe('62000');
    expect(session.userId).toBe('user2');
  });

  // The drawer is emptied overnight: only what stayed behind is there in the
  // morning, so carrying the whole count over would invent cash.
  it('carries over only what was left after a closing withdrawal', async () => {
    const { service } = build(null, {
      actualAmount: new Prisma.Decimal(587400),
      closingWithdrawal: new Prisma.Decimal(550000),
      closedAt: new Date(),
    });
    const session = await service.open({}, 'user2');
    expect(session.openingBalance.toString()).toBe('37400');
  });

  it('still honours an explicitly supplied float', async () => {
    const { service } = build(null, {
      actualAmount: new Prisma.Decimal(587400),
      closingWithdrawal: new Prisma.Decimal(550000),
      closedAt: new Date(),
    });
    const session = await service.open({ openingBalance: 10000 }, 'user2');
    expect(session.openingBalance.toString()).toBe('10000');
  });
});

/**
 * Closing takes the count first and moves cash afterwards. Banking the takings
 * must therefore leave the variance exactly where it was — if it were treated
 * as an ordinary cash movement it would shift `expected` and turn a balanced
 * drawer into a shortage.
 */
describe('CashService.close — banking the takings', () => {
  const build = () => {
    const calls: Record<string, unknown[]> = {};
    const record = (k: string, v: unknown) => (calls[k] = [...(calls[k] ?? []), v]);

    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'sess1', userId: 'u1', status: 'OPEN' }]),
      cashSession: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          openingBalance: new Prisma.Decimal(100000),
        }),
        update: jest.fn().mockImplementation(({ data }) => {
          record('session.update', data);
          return Promise.resolve({ id: 'sess1', ...data });
        }),
      },
      // Everything the expected-cash formula reads; all quiet but the opening.
      sale: { aggregate: jest.fn().mockResolvedValue({ _sum: { amountPaid: null } }) },
      customerPayment: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }) },
      cashMovement: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
        create: jest.fn().mockImplementation(({ data }) => {
          record('cashMovement.create', data);
          return Promise.resolve({});
        }),
      },
      expense: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }) },
      saleReturn: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { totalRefund: null, creditApplied: null } }),
      },
      purchase: { aggregate: jest.fn().mockResolvedValue({ _sum: { amountPaid: null } }) },
      supplierPayment: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    } as unknown as Prisma.TransactionClient;

    const prisma = { runSerializable: jest.fn().mockImplementation((cb) => cb(tx)) };
    const audit = { recordTx: jest.fn().mockResolvedValue(undefined) };
    const bank = {
      writeTx: jest.fn().mockImplementation((_tx, e) => {
        record('bank.write', e);
        return Promise.resolve({ id: 'bt1' });
      }),
    };

    return {
      service: new CashService(prisma as never, audit as never, bank as never),
      calls,
      bank,
    };
  };

  it('puts the banked cash on the bank ledger', async () => {
    const { service, calls } = build();
    await service.close(
      'sess1',
      { actualAmount: 100000, withdrawal: 80000, withdrawalTo: 'BANK' },
      'u1',
    );

    const write = calls['bank.write'][0] as { type: string; amount: { toFixed(n: number): string } };
    expect(write.type).toBe('TRANSFER_IN');
    expect(write.amount.toFixed(2)).toBe('80000.00');
  });

  it('leaves the variance untouched — the count came first', async () => {
    const { service, calls } = build();
    await service.close(
      'sess1',
      { actualAmount: 100000, withdrawal: 80000, withdrawalTo: 'BANK' },
      'u1',
    );

    const update = calls['session.update'][0] as { variance: Prisma.Decimal };
    expect(update.variance.toString()).toBe('0');
    // Never a cash movement: that would have moved `expected` under the count.
    expect(calls['cashMovement.create']).toBeUndefined();
  });

  it('does not touch the bank when the cash is simply held', async () => {
    const { service, calls } = build();
    await service.close('sess1', { actualAmount: 100000, withdrawal: 80000 }, 'u1');
    expect(calls['bank.write']).toBeUndefined();
  });
});
