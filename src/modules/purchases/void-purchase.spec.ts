import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PurchasesService } from './purchases.service';

/**
 * Undoing a purchase.
 *
 * The interesting half is everything it refuses. A purchase that has already
 * had stock sold out of it cannot be unwound without restating the COGS on
 * those sales, and a till that has been counted cannot have cash put back into
 * a shift that already balanced. Both are cases where the honest fix is a
 * correction dated today, so both throw rather than quietly rewrite history.
 */
describe('PurchasesService.void', () => {
  const batch = (over: Partial<Record<string, unknown>> = {}) => ({
    id: 'b1',
    variantId: 'v1',
    productId: 'p1',
    quantity: 60,
    remainingQuantity: 60,
    unitCost: new Prisma.Decimal(500),
    ...over,
  });

  const build = (
    over: Partial<Record<string, unknown>> = {},
    opts: { latestBatch?: { unitCost: Prisma.Decimal } | null } = {},
  ) => {
    const calls: Record<string, unknown[]> = {};
    const record = (k: string, v: unknown) => (calls[k] = [...(calls[k] ?? []), v]);

    const purchase = {
      id: 'pur1',
      purchaseNumber: 'PO-1',
      supplierId: 'sup1',
      userId: 'user1',
      purchaseDate: new Date('2026-09-01'),
      status: 'COMPLETED',
      totalCost: new Prisma.Decimal(30000),
      amountPaid: new Prisma.Decimal(30000),
      amountDue: new Prisma.Decimal(0),
      items: [{ variantId: 'v1' }],
      batches: [batch()],
      payments: [],
      cashSession: { id: 'sess1', status: 'OPEN' },
      ...over,
    };

    const tx = {
      purchase: {
        findUnique: jest.fn().mockResolvedValue(purchase),
        update: jest.fn().mockImplementation(({ data }) => {
          record('purchase.update', data);
          return Promise.resolve({ id: 'pur1', ...data });
        }),
      },
      inventoryBatch: {
        deleteMany: jest.fn().mockImplementation((args) => {
          record('batch.deleteMany', args);
          return Promise.resolve({ count: 1 });
        }),
        findFirst: jest
          .fn()
          .mockResolvedValue(
            opts.latestBatch === undefined
              ? { unitCost: new Prisma.Decimal(480) }
              : opts.latestBatch,
          ),
      },
      supplier: {
        findUnique: jest.fn().mockResolvedValue({ balance: new Prisma.Decimal(30000) }),
        update: jest.fn().mockImplementation((args) => {
          record('supplier.update', args);
          return Promise.resolve({});
        }),
      },
      productVariant: {
        update: jest.fn().mockImplementation(({ data }) => {
          record('variant.update', data);
          return Promise.resolve({});
        }),
      },
    } as unknown as Prisma.TransactionClient;

    const prisma = { runSerializable: jest.fn().mockImplementation((cb) => cb(tx)) };
    const inventory = {
      applyMovementTx: jest.fn().mockImplementation((_tx, p) => {
        record('movement', p);
        return Promise.resolve({ beforeQty: 60, afterQty: 60 + p.quantity });
      }),
    };
    const audit = { recordTx: jest.fn().mockResolvedValue(undefined) };
    const periods = { assertOpen: jest.fn().mockResolvedValue(undefined) };

    const service = new PurchasesService(
      prisma as never,
      inventory as never,
      { next: jest.fn() } as never,
      audit as never,
      periods as never,
    );
    return { service, calls, periods, tx };
  };

  it('takes the stock back off the shelf and removes the batches', async () => {
    const { service, calls } = build();

    await service.void('pur1', 'Entered twice by mistake', 'user1');

    const move = calls.movement[0] as { quantity: number; referenceType: string };
    expect(move.quantity).toBe(-60);
    expect(move.referenceType).toBe('PURCHASE_VOID');
    expect(calls['batch.deleteMany']).toHaveLength(1);
  });

  it('marks the purchase undone and clears what was owed on it', async () => {
    const { service, calls } = build({
      amountDue: new Prisma.Decimal(30000),
      amountPaid: new Prisma.Decimal(0),
      paymentMethod: 'CREDIT',
      cashSession: null,
    });

    await service.void('pur1', 'Wrong supplier', 'user1');

    const update = calls['purchase.update'][0] as { status: string; amountDue: unknown };
    expect(update.status).toBe('VOIDED');
    expect(String(update.amountDue)).toBe('0');
    // The supplier is no longer owed for a purchase that did not happen.
    expect(calls['supplier.update']).toHaveLength(1);
  });

  it('puts the reference buying price back to the newest batch still in stock', async () => {
    // The purchase overwrote it on the way in. Left behind, a stale reference
    // price is what a blank cost field falls back to next time, which is how a
    // box price once ended up costing a single sheet.
    const { service, calls } = build();

    await service.void('pur1', 'Entered twice by mistake', 'user1');

    const update = calls['variant.update'][0] as { buyingPrice: Prisma.Decimal };
    expect(update.buyingPrice.toString()).toBe('480');
  });

  it('refuses once stock has been sold out of it', async () => {
    const { service } = build({ batches: [batch({ remainingQuantity: 40 })] });

    await expect(service.void('pur1', 'Entered twice by mistake', 'user1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('refuses when a supplier payment settles against it', async () => {
    const { service } = build({ payments: [{ id: 'sp1' }] });

    await expect(service.void('pur1', 'Entered twice by mistake', 'user1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('refuses to put cash back into a till that has been counted', async () => {
    const { service } = build({ cashSession: { id: 'sess1', status: 'CLOSED' } });

    await expect(service.void('pur1', 'Entered twice by mistake', 'user1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('refuses a second undo', async () => {
    const { service } = build({ status: 'VOIDED' });

    await expect(service.void('pur1', 'Entered twice by mistake', 'user1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('refuses once the month has been closed', async () => {
    const { service, periods } = build();
    periods.assertOpen.mockRejectedValue(new ConflictException('closed'));

    await expect(service.void('pur1', 'Entered twice by mistake', 'user1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
