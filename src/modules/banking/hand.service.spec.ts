import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { HandService } from './hand.service';

/**
 * Unit tests for the held-cash ledger — the takings sitting at the shop between
 * bank trips. What matters here is that money cannot be in two places at once:
 *   - banking held cash moves it OUT of hand and INTO the bank, and leaves the
 *     till alone, because the money left the drawer days ago,
 *   - returning it to the drawer is a till deposit, because there it does,
 *   - neither can take out more than is actually being held.
 */
describe('HandService', () => {
  const D = (n: number) => new Prisma.Decimal(n);

  const build = (held: number, opts: { session?: { id: string } | null } = {}) => {
    const calls: Record<string, unknown[]> = {};
    const record = (k: string, v: unknown) => (calls[k] = [...(calls[k] ?? []), v]);

    const tx = {
      handTransaction: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: D(held) } }),
        create: jest.fn().mockImplementation(({ data }) => {
          record('hand.create', data);
          return Promise.resolve({ id: 'ht1', ...data });
        }),
      },
      cashMovement: {
        create: jest.fn().mockImplementation(({ data }) => {
          record('cashMovement.create', data);
          return Promise.resolve({ id: 'mv1', ...data });
        }),
      },
      cashSession: {
        findFirst: jest.fn().mockResolvedValue(
          opts.session === undefined ? { id: 'sess1' } : opts.session,
        ),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    } as unknown as Prisma.TransactionClient;

    const prisma = {
      handTransaction: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: D(held) } }),
      },
      runSerializable: jest.fn().mockImplementation((cb) => cb(tx)),
    };
    const audit = { recordTx: jest.fn().mockResolvedValue(undefined) };
    const bank = {
      writeTx: jest.fn().mockImplementation((_tx, e) => {
        record('bank.write', e);
        return Promise.resolve({ id: 'bt1' });
      }),
    };

    return {
      service: new HandService(prisma as never, audit as never, bank as never),
      calls,
      // spendTx is called inside the caller's transaction, so tests hand it
      // this one directly rather than going through the service.
      tx,
    };
  };

  describe('bankHeldCash — the weekly trip', () => {
    it('moves the money out of hand and into the bank', async () => {
      const { service, calls } = build(500000);
      await service.bankHeldCash({ amount: 400000 }, 'u1');

      const bankRow = calls['bank.write'][0] as {
        type: string;
        amount: { toFixed(n: number): string };
      };
      expect(bankRow.type).toBe('TRANSFER_IN');
      expect(bankRow.amount.toFixed(2)).toBe('400000.00');

      const handRow = calls['hand.create'][0] as { type: string; amount: Prisma.Decimal };
      expect(handRow.type).toBe('TO_BANK');
      // Negative: the ledger balance is the sum of its rows.
      expect(handRow.amount.toString()).toBe('-400000');
    });

    it('leaves the till out of it — the cash left the drawer days ago', async () => {
      const { service, calls } = build(500000);
      await service.bankHeldCash({ amount: 400000 }, 'u1');
      // A CashMovement here would report a shortage in a drawer that never
      // held this money.
      expect(calls['cashMovement.create']).toBeUndefined();
    });

    it('does not need an open till', async () => {
      const { service } = build(500000, { session: null });
      await expect(service.bankHeldCash({ amount: 400000 }, 'u1')).resolves.toBeDefined();
    });

    it('refuses to bank more than is being held', async () => {
      const { service } = build(100000);
      await expect(
        service.bankHeldCash({ amount: 100001 }, 'u1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('returnToTill', () => {
    it('deposits into the drawer and takes it off the held figure', async () => {
      const { service, calls } = build(500000);
      await service.returnToTill({ amount: 50000 }, 'u1');

      const movement = calls['cashMovement.create'][0] as {
        type: string;
        cashSessionId: string;
      };
      expect(movement.type).toBe('DEPOSIT');
      expect(movement.cashSessionId).toBe('sess1');

      const handRow = calls['hand.create'][0] as { type: string; amount: Prisma.Decimal };
      expect(handRow.type).toBe('TO_TILL');
      expect(handRow.amount.toString()).toBe('-50000');
    });

    it('needs a till to put it into', async () => {
      const { service } = build(500000, { session: null });
      await expect(
        service.returnToTill({ amount: 50000 }, 'u1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses to return more than is being held', async () => {
      const { service } = build(10000);
      await expect(
        service.returnToTill({ amount: 20000 }, 'u1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('spendTx — a bill paid from the pocket', () => {
    it('takes the money off the held figure and names what it paid for', async () => {
      const { service, calls, tx } = build(120500);
      await service.spendTx(tx, { amount: D(30000), userId: 'u1', expenseId: 'exp1' });

      const row = calls['hand.create'][0] as {
        type: string;
        amount: Prisma.Decimal;
        expenseId: string;
      };
      expect(row.type).toBe('SPENT');
      // Negative: the ledger balance is the sum of its rows.
      expect(row.amount.toString()).toBe('-30000');
      expect(row.expenseId).toBe('exp1');
    });

    it('leaves the till out of it — the money never went back to the drawer', async () => {
      const { service, calls, tx } = build(120500);
      await service.spendTx(tx, { amount: D(30000), userId: 'u1', expenseId: 'exp1' });
      expect(calls['cashMovement.create']).toBeUndefined();
    });

    it('records a vendor payment against the payment, not the expense', async () => {
      const { service, calls, tx } = build(120500);
      await service.spendTx(tx, {
        amount: D(25000),
        userId: 'u1',
        expensePaymentId: 'pay1',
      });

      const row = calls['hand.create'][0] as {
        expenseId: string | null;
        expensePaymentId: string;
      };
      expect(row.expensePaymentId).toBe('pay1');
      expect(row.expenseId).toBeNull();
    });

    it('refuses to spend more than is being held', async () => {
      const { service, tx } = build(10000);
      await expect(
        service.spendTx(tx, { amount: D(10001), userId: 'u1', expenseId: 'exp1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('correct', () => {
    it('refuses a correction that changes nothing', async () => {
      const { service } = build(100000);
      await expect(
        service.correct({ amount: 0, reason: 'recount' }, 'u1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses to subtract more than is held', async () => {
      const { service } = build(5000);
      await expect(
        service.correct({ amount: -6000, reason: 'recount' }, 'u1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows adding cash that was being held unrecorded', async () => {
      const { service, calls } = build(5000);
      await service.correct({ amount: 2000, reason: 'found in the safe' }, 'u1');

      const row = calls['hand.create'][0] as { type: string; notes: string };
      expect(row.type).toBe('CORRECTION');
      expect(row.notes).toBe('found in the safe');
    });
  });
});
