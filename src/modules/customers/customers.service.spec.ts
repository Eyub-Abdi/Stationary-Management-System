import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CustomersService } from './customers.service';

/**
 * Unit tests for customer repayments: the balance guards (can't pay more than
 * owed / nothing owed), the till-session requirement, the balance decrement,
 * and idempotent dedup of a retried payment.
 */
describe('CustomersService.recordPayment', () => {
  const D = (n: number) => new Prisma.Decimal(n);

  const build = (
    opts: {
      balance?: number;
      session?: { id: string } | null;
      invoices?: { id: string; amountDue: number }[];
    } = {},
  ) => {
    const calls: Record<string, unknown[]> = {};
    const record = (k: string, v: unknown) => (calls[k] = [...(calls[k] ?? []), v]);

    const invoices = (opts.invoices ?? [{ id: 's1', amountDue: opts.balance ?? 14000 }]).map(
      (i) => ({ id: i.id, amountDue: D(i.amountDue) }),
    );

    const tx = {
      customer: {
        findUnique: jest.fn().mockResolvedValue({ id: 'c1', balance: D(opts.balance ?? 14000) }),
        update: jest.fn().mockImplementation(({ data }) => {
          record('customer.update', data);
          return Promise.resolve({});
        }),
      },
      cashSession: {
        findFirst: jest.fn().mockResolvedValue(opts.session === undefined ? { id: 'sess1' } : opts.session),
      },
      sale: {
        findUnique: jest.fn().mockResolvedValue({ id: 's1', customerId: 'c1' }),
        findMany: jest.fn().mockResolvedValue(invoices),
        update: jest.fn().mockImplementation(({ where, data }) => {
          record('sale.update', { id: where.id, decrement: data.amountDue.decrement });
          return Promise.resolve({});
        }),
      },
      customerPayment: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => {
          record('payment.create', data);
          return Promise.resolve({ id: 'pay1', ...data });
        }),
      },
      customerPaymentAllocation: {
        create: jest.fn().mockImplementation(({ data }) => {
          record('allocation.create', data);
          return Promise.resolve({});
        }),
      },
    } as unknown as Prisma.TransactionClient;

    const prisma = {
      customerPayment: { findUnique: jest.fn().mockResolvedValue(null) },
      runSerializable: jest.fn().mockImplementation((cb) => cb(tx)),
    };
    const audit = { recordTx: jest.fn().mockResolvedValue(undefined) };
    const service = new CustomersService(prisma as never, audit as never);
    return { service, calls, prisma };
  };

  it('decrements the balance by the payment amount', async () => {
    const { service, calls } = build({ balance: 14000 });
    const res = await service.recordPayment('c1', { amount: 5000 }, 'user1');

    const update = calls['customer.update'][0] as { balance: Prisma.Decimal };
    expect(update.balance.toString()).toBe('9000');
    expect((res as { balance: string }).balance).toBe('9000');
  });

  it('allocates a repayment across invoices oldest-first', async () => {
    // Owes 14,000 across two invoices (8,000 then 6,000). Pay 10,000 → clears
    // the first (8,000) and part of the second (2,000).
    const { service, calls } = build({
      balance: 14000,
      invoices: [
        { id: 's1', amountDue: 8000 },
        { id: 's2', amountDue: 6000 },
      ],
    });
    await service.recordPayment('c1', { amount: 10000 }, 'user1');

    const updates = (calls['sale.update'] ?? []) as { id: string; decrement: Prisma.Decimal }[];
    expect(updates.map((u) => [u.id, u.decrement.toString()])).toEqual([
      ['s1', '8000'],
      ['s2', '2000'],
    ]);
    const allocs = (calls['allocation.create'] ?? []) as { saleId: string; amount: Prisma.Decimal }[];
    expect(allocs).toHaveLength(2);
  });

  it('rejects a payment greater than the outstanding balance', async () => {
    const { service } = build({ balance: 3000 });
    await expect(service.recordPayment('c1', { amount: 5000 }, 'user1')).rejects.toThrow(
      /exceeds the outstanding balance/i,
    );
  });

  it('rejects a payment when nothing is owed', async () => {
    const { service } = build({ balance: 0 });
    await expect(service.recordPayment('c1', { amount: 1000 }, 'user1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('requires an open cash session to receive the cash', async () => {
    const { service } = build({ balance: 5000, session: null });
    await expect(service.recordPayment('c1', { amount: 1000 }, 'user1')).rejects.toThrow(
      /no open cash session/i,
    );
  });

  it('returns the original payment on a repeated idempotency key', async () => {
    const { service, prisma } = build({ balance: 5000 });
    (prisma.customerPayment.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'pay1',
      amount: D(1000),
      customer: { balance: D(4000) },
    });
    const res = await service.recordPayment('c1', { amount: 1000 }, 'user1', 'key-1');
    expect((res as { payment: { id: string } }).payment.id).toBe('pay1');
    expect((res as { balance: string }).balance).toBe('4000');
    expect(prisma.runSerializable).not.toHaveBeenCalled();
  });
});
