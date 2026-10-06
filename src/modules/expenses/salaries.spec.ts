import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ExpensesService } from './expenses.service';
import { CreateSalaryDto } from './dto/salary.dto';

/**
 * Salaries are expenses under the Salary category with a name and a month on
 * them. These tests pin both halves: a salary is booked exactly like any paid
 * expense, and the generic expense routes leave salaries alone.
 */
describe('ExpensesService — salaries', () => {
  const dto = (over: Partial<CreateSalaryDto> = {}): CreateSalaryDto =>
    ({
      payeeName: 'Warda Hamid',
      payPeriod: '2026-09',
      amount: 80000,
      paidOn: new Date('2026-10-01'),
      ...over,
    }) as CreateSalaryDto;

  const build = (existing?: Record<string, unknown>, heldSpent = 0) => {
    const calls: Record<string, unknown[]> = {};
    const record = (k: string, v: unknown) => (calls[k] = [...(calls[k] ?? []), v]);

    const tx = {
      expense: {
        create: jest.fn().mockImplementation(({ data }) => {
          record('expense.create', data);
          return Promise.resolve({ id: 'exp1', ...data, category: { name: 'Salary' } });
        }),
        delete: jest.fn().mockImplementation((args) => {
          record('expense.delete', args);
          return Promise.resolve({});
        }),
      },
      handTransaction: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { amount: heldSpent ? new Prisma.Decimal(-heldSpent) : null },
        }),
      },
    } as unknown as Prisma.TransactionClient;

    const prisma = {
      cashSession: { findFirst: jest.fn().mockResolvedValue({ id: 'sess1' }) },
      runSerializable: jest.fn().mockImplementation((cb) => cb(tx)),
      expense: {
        findUnique: jest.fn().mockResolvedValue(
          existing && {
            items: [],
            payments: [],
            category: { name: 'Salary' },
            cashSession: null,
            amount: new Prisma.Decimal(80000),
            expenseDate: new Date('2026-10-01'),
            ...existing,
          },
        ),
        update: jest.fn().mockImplementation(({ data }) => {
          record('expense.update', data);
          return Promise.resolve({ ...data, amount: new Prisma.Decimal(1) });
        }),
        findMany: jest.fn().mockImplementation((args) => {
          record('expense.findMany', args);
          return Promise.resolve([]);
        }),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn().mockImplementation((ops) => Promise.all(ops)),
    };
    const audit = {
      recordTx: jest.fn().mockResolvedValue(undefined),
      record: jest.fn().mockResolvedValue(undefined),
    };
    const categories = {
      salaryCategoryId: jest.fn().mockResolvedValue('cat-salary'),
      assertUsable: jest.fn().mockResolvedValue({}),
    };
    const periods = { assertOpen: jest.fn().mockResolvedValue(undefined) };
    const hand = {
      spendTx: jest.fn().mockResolvedValue({ id: 'ht1' }),
      writeTx: jest.fn().mockImplementation((_tx, e) => {
        record('hand.write', e);
        return Promise.resolve({ id: 'ht2' });
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

  it('books a salary as a paid Salary expense with who and which month', async () => {
    const { service, calls } = build();
    await service.createSalary(dto(), 'u1');

    const data = calls['expense.create'][0] as Record<string, unknown>;
    expect(data.categoryId).toBe('cat-salary');
    expect(data.payeeName).toBe('Warda Hamid');
    expect(data.payPeriod).toEqual(new Date('2026-09-01T00:00:00.000Z'));
    // Paid on 1 October for September: the cost lands on the day it was paid.
    expect(data.expenseDate).toEqual(new Date('2026-10-01'));
    expect(String(data.amountPaid)).toBe('80000');
    expect(String(data.amountDue)).toBe('0');
    expect(data.cashSessionId).toBe('sess1');
  });

  it('refuses the Salary category on the generic expense form', async () => {
    const { service } = build();
    await expect(
      service.create(
        { categoryId: 'cat-salary', amount: 1000, expenseDate: new Date() },
        'u1',
        true,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to edit a salary through the generic expense route', async () => {
    const { service } = build({ categoryId: 'cat-salary', userId: 'u1' });
    await expect(service.update('exp1', { amount: 5 }, 'u1', true)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('keeps salaries out of the expense list', async () => {
    const { service, calls } = build();
    await service.findAll({ page: 1, limit: 20, skip: 0 } as never, true);
    const args = calls['expense.findMany'][0] as { where: Prisma.ExpenseWhereInput };
    expect(args.where.NOT).toEqual({ categoryId: 'cat-salary' });
  });

  it('will not change the amount of a salary paid from held cash', async () => {
    const { service } = build({ categoryId: 'cat-salary', userId: 'u1', paidFrom: 'HELD_CASH' });
    await expect(
      service.updateSalary('exp1', { amount: 90000 }, 'u1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('moves the amount paid with the amount when a salary is corrected', async () => {
    const { service, calls } = build({ categoryId: 'cat-salary', userId: 'u1', paidFrom: 'TILL' });
    await service.updateSalary('exp1', { amount: 90000, payeeName: 'Warda' }, 'u1');
    const data = calls['expense.update'][0] as Record<string, unknown>;
    expect(String(data.amount)).toBe('90000');
    expect(String(data.amountPaid)).toBe('90000');
    expect(data.payeeName).toBe('Warda');
  });

  it('returns the money to held cash when a held-cash payment is deleted', async () => {
    const { service, calls } = build(
      { categoryId: 'cat-salary', userId: 'u1', paidFrom: 'HELD_CASH', payeeName: 'Warda', amountDue: new Prisma.Decimal(0) },
      80000,
    );
    await service.remove('exp1', 'u1', true);

    const back = calls['hand.write'][0] as { type: string; amount: Prisma.Decimal; notes: string };
    expect(back.type).toBe('CORRECTION');
    expect(back.amount.toString()).toBe('80000');
    expect(back.notes).toContain('Warda');
    expect(calls['expense.delete']).toHaveLength(1);
  });

  it('touches held cash not at all when the payment came from the till', async () => {
    const { service, calls } = build(
      { categoryId: 'cat-salary', userId: 'u1', paidFrom: 'TILL', amountDue: new Prisma.Decimal(0) },
    );
    await service.remove('exp1', 'u1', true);
    expect(calls['hand.write']).toBeUndefined();
    expect(calls['expense.delete']).toHaveLength(1);
  });
});
