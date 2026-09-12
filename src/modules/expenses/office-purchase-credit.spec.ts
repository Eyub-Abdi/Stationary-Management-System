import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ExpensesService } from './expenses.service';
import { CreateOfficePurchaseDto } from './dto/office-purchase.dto';

/**
 * Unit tests for office purchases bought on credit: the cost is recorded now,
 * the cash is not. The Prisma client and collaborators are mocked, so what is
 * asserted is the settlement arithmetic and the rules around it —
 *   - a credit purchase charges no till and leaves amountDue owed,
 *   - a part-payment splits the total without losing a shilling,
 *   - paying it down moves both halves and refuses to overpay.
 */
describe('ExpensesService — office purchases on credit', () => {
  const dto = (over: Partial<CreateOfficePurchaseDto> = {}): CreateOfficePurchaseDto =>
    ({
      purchaseDate: new Date('2026-09-12'),
      supplierName: 'Acme Supplies',
      items: [{ name: 'Printer paper', quantity: 5, unitCost: 8000 }],
      ...over,
    }) as CreateOfficePurchaseDto;

  const build = () => {
    const calls: Record<string, unknown[]> = {};
    const record = (k: string, v: unknown) => (calls[k] = [...(calls[k] ?? []), v]);

    const tx = {
      expense: {
        create: jest.fn().mockImplementation(({ data }) => {
          record('expense.create', data);
          return Promise.resolve({
            id: 'exp1',
            ...data,
            category: { name: 'Office Supplies' },
          });
        }),
      },
    } as unknown as Prisma.TransactionClient;

    const prisma = {
      cashSession: { findFirst: jest.fn().mockResolvedValue({ id: 'sess1' }) },
      runSerializable: jest.fn().mockImplementation((cb) => cb(tx)),
    };
    const audit = { recordTx: jest.fn().mockResolvedValue(undefined) };
    const categories = { officeCategoryId: jest.fn().mockResolvedValue('cat-office') };
    const periods = { assertOpen: jest.fn().mockResolvedValue(undefined) };
    const hand = {
      spendTx: jest.fn().mockImplementation((_tx, e) => {
        record('hand.spend', e);
        return Promise.resolve({ id: 'ht1' });
      }),
    };

    return {
      service: new ExpensesService(
        prisma as never,
        audit as never,
        categories as never,
        periods as never,
        hand as never,
      ),
      calls,
    };
  };

  /** The row handed to Prisma, which is where the arithmetic ends up. */
  const created = (calls: Record<string, unknown[]>) =>
    calls['expense.create'][0] as Record<string, Prisma.Decimal & string>;

  it('takes nothing from the till when the goods are taken on account', async () => {
    const { service, calls } = build();
    await service.createOfficePurchase(dto({ paymentMethod: 'CREDIT' }), 'u1');

    const data = created(calls);
    expect(data.amount.toString()).toBe('40000');
    expect(data.amountPaid.toString()).toBe('0');
    expect(data.amountDue.toString()).toBe('40000');
    // No till owns it: nothing left the drawer, so no close has to explain it.
    expect(data.cashSessionId).toBeUndefined();
  });

  it('charges the till in full when it is paid on the spot', async () => {
    const { service, calls } = build();
    await service.createOfficePurchase(dto(), 'u1');

    const data = created(calls);
    expect(data.paymentMethod).toBe('CASH');
    expect(data.amountPaid.toString()).toBe('40000');
    expect(data.amountDue.toString()).toBe('0');
    expect(data.cashSessionId).toBe('sess1');
  });

  it('splits a part-payment without losing a shilling', async () => {
    const { service, calls } = build();
    await service.createOfficePurchase(
      dto({ paymentMethod: 'CREDIT', amountPaid: 15000 }),
      'u1',
    );

    const data = created(calls);
    expect(data.amountPaid.toString()).toBe('15000');
    expect(data.amountDue.toString()).toBe('25000');
    // Part of it did come out of the drawer, so that till carries it.
    expect(data.cashSessionId).toBe('sess1');
  });

  it('spends held cash without touching a till', async () => {
    const { service, calls } = build();
    await service.createOfficePurchase(dto({ paidFrom: 'HELD_CASH' }), 'u1');

    const data = created(calls);
    expect(data.paidFrom).toBe('HELD_CASH');
    expect(data.amountPaid.toString()).toBe('40000');
    // No session: this money never saw a drawer, so no count must explain it.
    expect(data.cashSessionId).toBeUndefined();

    const spend = calls['hand.spend'][0] as {
      amount: { toFixed(n: number): string };
      expenseId: string;
    };
    expect(spend.amount.toFixed(2)).toBe('40000.00');
    expect(spend.expenseId).toBe('exp1');
  });

  it('spends only the part-payment from held cash, not the whole total', async () => {
    const { service, calls } = build();
    await service.createOfficePurchase(
      dto({ paymentMethod: 'CREDIT', amountPaid: 15000, paidFrom: 'HELD_CASH' }),
      'u1',
    );

    const spend = calls['hand.spend'][0] as { amount: { toFixed(n: number): string } };
    expect(spend.amount.toFixed(2)).toBe('15000.00');
    expect(created(calls).amountDue.toString()).toBe('25000');
  });

  it('records no source, and no spend, when nothing is paid now', async () => {
    const { service, calls } = build();
    await service.createOfficePurchase(
      dto({ paymentMethod: 'CREDIT', paidFrom: 'HELD_CASH' }),
      'u1',
    );
    // Asked for held cash but handed over nothing: no pot was touched.
    expect(created(calls).paidFrom).toBeNull();
    expect(calls['hand.spend']).toBeUndefined();
  });

  it('refuses a credit purchase with nobody named to pay', async () => {
    const { service } = build();
    await expect(
      service.createOfficePurchase(
        dto({ paymentMethod: 'CREDIT', supplierName: '  ' }),
        'u1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a part-payment larger than the purchase itself', async () => {
    const { service } = build();
    await expect(
      service.createOfficePurchase(
        dto({ paymentMethod: 'CREDIT', amountPaid: 50000 }),
        'u1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

/**
 * Paying a credit purchase down. The cost was booked on the purchase date, so
 * a payment moves cash only — out of the till of the day it is handed over.
 */
describe('ExpensesService.payOfficePurchase', () => {
  const D = (n: number) => new Prisma.Decimal(n);

  const build = (owed: number, paid = 0) => {
    const calls: Record<string, unknown[]> = {};
    const record = (k: string, v: unknown) => (calls[k] = [...(calls[k] ?? []), v]);

    const tx = {
      expensePayment: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => {
          record('payment.create', data);
          return Promise.resolve({ id: 'pay1', ...data });
        }),
      },
      expense: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'exp1',
          amountPaid: D(paid),
          amountDue: D(owed),
          supplierName: 'Acme Supplies',
        }),
        update: jest.fn().mockImplementation(({ data }) => {
          record('expense.update', data);
          return Promise.resolve(data);
        }),
      },
      cashSession: { findFirst: jest.fn().mockResolvedValue({ id: 'sess2' }) },
    } as unknown as Prisma.TransactionClient;

    const prisma = {
      expensePayment: { findUnique: jest.fn().mockResolvedValue(null) },
      runSerializable: jest.fn().mockImplementation((cb) => cb(tx)),
    };
    const audit = { recordTx: jest.fn().mockResolvedValue(undefined) };
    const categories = { officeCategoryId: jest.fn().mockResolvedValue('cat-office') };
    const hand = {
      spendTx: jest.fn().mockImplementation((_tx, e) => {
        record('hand.spend', e);
        return Promise.resolve({ id: 'ht1' });
      }),
    };

    return {
      service: new ExpensesService(
        prisma as never,
        audit as never,
        categories as never,
        { assertOpen: jest.fn() } as never,
        hand as never,
      ),
      calls,
      tx,
    };
  };

  it('moves both halves of the balance and charges the open till', async () => {
    const { service, calls } = build(40000);
    await service.payOfficePurchase('exp1', { amount: 25000 }, 'u1');

    const payment = calls['payment.create'][0] as Record<string, Prisma.Decimal & string>;
    expect(payment.cashSessionId).toBe('sess2');
    expect(payment.amount.toString()).toBe('25000');

    const update = calls['expense.update'][0] as Record<string, Prisma.Decimal>;
    expect(update.amountPaid.toString()).toBe('25000');
    expect(update.amountDue.toString()).toBe('15000');
  });

  it('adds to what was already part-paid', async () => {
    const { service, calls } = build(25000, 15000);
    await service.payOfficePurchase('exp1', { amount: 25000 }, 'u1');

    const update = calls['expense.update'][0] as Record<string, Prisma.Decimal>;
    expect(update.amountPaid.toString()).toBe('40000');
    expect(update.amountDue.toString()).toBe('0');
  });

  it('pays a vendor from held cash with no till open', async () => {
    const { service, calls, tx } = build(40000);
    (tx.cashSession.findFirst as jest.Mock).mockResolvedValue(null);

    await service.payOfficePurchase(
      'exp1',
      { amount: 25000, paidFrom: 'HELD_CASH' },
      'u1',
    );

    const payment = calls['payment.create'][0] as Record<string, unknown>;
    expect(payment.paidFrom).toBe('HELD_CASH');
    expect(payment.cashSessionId).toBeUndefined();

    const spend = calls['hand.spend'][0] as {
      amount: { toFixed(n: number): string };
      expensePaymentId: string;
    };
    expect(spend.amount.toFixed(2)).toBe('25000.00');
    expect(spend.expensePaymentId).toBe('pay1');

    // The balance moves exactly as it would have from the till.
    const update = calls['expense.update'][0] as Record<string, Prisma.Decimal>;
    expect(update.amountDue.toString()).toBe('15000');
  });

  it('never charges both the till and the held cash for one payment', async () => {
    const { service, calls } = build(40000);
    await service.payOfficePurchase('exp1', { amount: 25000 }, 'u1');

    const payment = calls['payment.create'][0] as Record<string, unknown>;
    expect(payment.paidFrom).toBe('TILL');
    expect(payment.cashSessionId).toBe('sess2');
    expect(calls['hand.spend']).toBeUndefined();
  });

  it('refuses to pay more than is still owed', async () => {
    const { service } = build(10000);
    await expect(
      service.payOfficePurchase('exp1', { amount: 10001 }, 'u1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to pay a purchase that owes nothing', async () => {
    const { service } = build(0, 40000);
    await expect(
      service.payOfficePurchase('exp1', { amount: 100 }, 'u1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('will not pay out of a till nobody has opened', async () => {
    const { service, tx } = build(40000);
    (tx.cashSession.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(
      service.payOfficePurchase('exp1', { amount: 1000 }, 'u1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
