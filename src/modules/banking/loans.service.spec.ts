import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LoansService } from './loans.service';

const D = (n: number) => new Prisma.Decimal(n);

/**
 * A loan is a debt owed TO the shop, so the two things that must hold are that
 * profit never moves when one is issued, and that cash leaving the drawer is
 * told to the till — otherwise the close-of-day count reports a shortage that
 * nobody took.
 */
describe('LoansService', () => {
  const borrower = { id: 'u2', fullName: 'Warda Hamid', isActive: true };

  const build = (
    opts: { session?: { id: string } | null; loan?: unknown; till?: number } = {},
  ) => {
    const calls: Record<string, unknown[]> = {};
    const record = (k: string, v: unknown) => (calls[k] = [...(calls[k] ?? []), v]);
    // What the drawer holds, for the guard that stops us lending more than that.
    const till = opts.till ?? 1_000_000;
    const noSum = jest.fn().mockResolvedValue({ _sum: {} });

    const tx = {
      cashSession: {
        findFirst: jest.fn().mockResolvedValue(
          opts.session === undefined ? { id: 'sess1' } : opts.session,
        ),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ openingBalance: D(till) }),
      },
      // The expected-cash formula: an opening float and an otherwise quiet day.
      sale: { aggregate: noSum },
      customerPayment: { aggregate: noSum },
      saleReturn: { aggregate: noSum },
      purchase: { aggregate: noSum },
      supplierPayment: { aggregate: noSum },
      loan: {
        create: jest.fn().mockImplementation(({ data }) => {
          record('loan.create', data);
          return Promise.resolve({
            id: 'loan1',
            ...data,
            status: 'OUTSTANDING',
            user: borrower,
            repayments: [],
          });
        }),
        findUnique: jest.fn().mockResolvedValue(opts.loan ?? null),
        update: jest.fn().mockImplementation(({ data }) => {
          record('loan.update', data);
          return Promise.resolve({
            id: 'loan1',
            amount: D(200000),
            dueDate: new Date('2026-09-01'),
            status: data.status,
            user: borrower,
            repayments: [{ amount: D(200000) }],
          });
        }),
      },
      loanRepayment: {
        create: jest.fn().mockImplementation(({ data }) => {
          record('repayment.create', data);
          return Promise.resolve({ id: 'rep1', ...data });
        }),
      },
      cashMovement: {
        aggregate: noSum,
        create: jest.fn().mockImplementation(({ data }) => {
          record('cashMovement.create', data);
          return Promise.resolve({ id: 'mv1', ...data });
        }),
      },
      expense: {
        aggregate: noSum,
        // Nothing here may ever write one of these.
        create: jest.fn().mockImplementation(() => {
          record('expense.create', true);
          return Promise.resolve({});
        }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    } as unknown as Prisma.TransactionClient;

    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(borrower) },
      runSerializable: jest.fn().mockImplementation((cb) => cb(tx)),
    };
    const bank = {
      assertCovers: jest.fn().mockResolvedValue(undefined),
      writeTx: jest.fn().mockImplementation((_tx, e) => {
        record('bank.write', e);
        return Promise.resolve({ id: 'bt1' });
      }),
    };
    const audit = { recordTx: jest.fn().mockResolvedValue(undefined) };

    return {
      service: new LoansService(prisma as never, bank as never, audit as never),
      calls,
      bank,
    };
  };

  const dto = (over = {}) => ({
    userId: 'u2',
    amount: 200000,
    source: 'HAND' as const,
    dueDate: new Date('2026-09-01'),
    ...over,
  });

  it('takes cash out of the till so the drawer still reconciles', async () => {
    const { service, calls } = build();
    await service.issue(dto(), 'admin1');

    const move = calls['cashMovement.create'][0] as { type: string; amount: Prisma.Decimal };
    expect(move.type).toBe('WITHDRAWAL');
    expect(move.amount.toString()).toBe('200000');
  });

  it('never records a loan as an expense', async () => {
    const { service, calls } = build();
    await service.issue(dto(), 'admin1');
    expect(calls['expense.create']).toBeUndefined();
  });

  it('refuses to lend cash when no till is open', async () => {
    const { service } = build({ session: null });
    await expect(service.issue(dto(), 'admin1')).rejects.toThrow(/No open cash session/i);
  });

  // Lending past the drawer would leave it expecting a negative amount, and
  // every close afterwards reporting a shortage nobody took.
  it('refuses to lend more cash than the till holds', async () => {
    const { service, calls } = build({ till: 80_000 });
    await expect(service.issue(dto({ amount: 200_000 }), 'admin1')).rejects.toThrow(
      /till holds 80000.00/i,
    );
    expect(calls['cashMovement.create']).toBeUndefined();
  });

  it('lends from the bank without touching the till', async () => {
    const { service, calls } = build();
    await service.issue(dto({ source: 'BANK' }), 'admin1');

    expect(calls['cashMovement.create']).toBeUndefined();
    const write = calls['bank.write'][0] as { type: string; amount: { toFixed(n: number): string } };
    expect(write.type).toBe('LOAN_OUT');
    // Signed against the balance: lending takes money out of the bank.
    expect(write.amount.toFixed(2)).toBe('-200000.00');
  });

  it('checks the bank can cover it before lending', async () => {
    const { service, bank } = build();
    await service.issue(dto({ source: 'BANK' }), 'admin1');
    expect(bank.assertCovers).toHaveBeenCalled();
  });

  it('refuses an inactive borrower', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ ...borrower, isActive: false }),
      },
      // Never reached: the borrower is rejected before any money moves.
      runSerializable: jest.fn(),
    };
    const service = new LoansService(prisma as never, {} as never, {} as never);

    await expect(service.issue(dto(), 'admin1')).rejects.toThrow(/no longer active/i);
    expect(prisma.runSerializable).not.toHaveBeenCalled();
  });

  describe('repayment', () => {
    const outstanding = {
      id: 'loan1',
      amount: D(200000),
      dueDate: new Date('2026-09-01'),
      status: 'OUTSTANDING',
      user: borrower,
      repayments: [{ amount: D(50000) }],
    };

    it('puts a cash repayment back into the till', async () => {
      const { service, calls } = build({ loan: outstanding });
      await service.repay('loan1', { amount: 50000, destination: 'HAND' }, 'admin1');

      const move = calls['cashMovement.create'][0] as { type: string };
      expect(move.type).toBe('DEPOSIT');
    });

    it('refuses more than is still owed', async () => {
      const { service } = build({ loan: outstanding });
      // 200,000 borrowed, 50,000 already repaid — 160,000 is too much.
      await expect(
        service.repay('loan1', { amount: 160000, destination: 'HAND' }, 'admin1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('marks the loan repaid once nothing is left', async () => {
      const { service, calls } = build({ loan: outstanding });
      await service.repay('loan1', { amount: 150000, destination: 'BANK' }, 'admin1');

      const update = calls['loan.update'][0] as { status: string };
      expect(update.status).toBe('REPAID');
    });
  });
});
