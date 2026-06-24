import { Prisma } from '@prisma/client';
import { SellUnit } from '../../common/enums/sell-unit.enum';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';

/**
 * Unit tests for purchase recording: dual-unit cost conversion to base units,
 * cash vs credit settlement (supplier payable), till linkage, and idempotency.
 * The Prisma transaction client and the inventory/sequence/audit collaborators
 * are mocked so the orchestration logic is asserted without a database.
 */
describe('PurchasesService.create', () => {
  const product = {
    id: 'p1',
    name: 'Blue Pen',
    baseUnit: 'pcs',
    bulkUnit: 'Box',
    unitSize: 12,
  };

  const build = (opts: { session?: { id: string } | null } = {}) => {
    const calls: Record<string, unknown[]> = {};
    const record = (k: string, v: unknown) => (calls[k] = [...(calls[k] ?? []), v]);

    const tx = {
      purchase: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => {
          record('purchase.create', data);
          return Promise.resolve({ id: 'pur1', ...data });
        }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'pur1', items: [] }),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([product]),
        update: jest.fn().mockImplementation(({ data }) => {
          record('product.update', data);
          return Promise.resolve({});
        }),
      },
      supplier: {
        findUnique: jest.fn().mockResolvedValue({ id: 'sup1', name: 'Acme' }),
        update: jest.fn().mockImplementation((args) => {
          record('supplier.update', args);
          return Promise.resolve({});
        }),
      },
      cashSession: {
        findFirst: jest.fn().mockResolvedValue(opts.session ?? { id: 'sess1' }),
      },
      purchaseItem: {
        create: jest.fn().mockImplementation(({ data }) => {
          record('purchaseItem.create', data);
          return Promise.resolve({ id: 'pi1', ...data });
        }),
      },
    } as unknown as Prisma.TransactionClient;

    const prisma = {
      purchase: { findUnique: jest.fn().mockResolvedValue(null) },
      runSerializable: jest.fn().mockImplementation((cb) => cb(tx)),
    };
    const inventory = {
      addBatchTx: jest.fn().mockImplementation((_tx, p) => {
        record('addBatch', p);
        return Promise.resolve('batch1');
      }),
      applyMovementTx: jest.fn().mockImplementation((_tx, p) => {
        record('movement', p);
        return Promise.resolve({ beforeQty: 0, afterQty: p.quantity });
      }),
    };
    const sequences = { next: jest.fn().mockResolvedValue('PUR-1') };
    const audit = { recordTx: jest.fn().mockResolvedValue(undefined) };

    const service = new PurchasesService(
      prisma as never,
      inventory as never,
      sequences as never,
      audit as never,
    );
    return { service, calls, prisma, tx };
  };

  const baseDto = (over: Partial<CreatePurchaseDto> = {}): CreatePurchaseDto => ({
    supplierId: 'sup1',
    purchaseDate: new Date('2026-06-23'),
    items: [{ productId: 'p1', quantity: 5, unitCost: 6000, sellUnit: SellUnit.BULK }],
    ...over,
  });

  it('converts a bulk purchase to base units and per-piece cost', async () => {
    const { service, calls } = build();
    await service.create(baseDto({ paymentMethod: 'CASH' }), 'user1');

    // 5 boxes × 12 = 60 pieces; 6000 / 12 = 500 per piece.
    const batch = calls['addBatch'][0] as { quantity: number; unitCost: Prisma.Decimal };
    expect(batch.quantity).toBe(60);
    expect(batch.unitCost.toString()).toBe('500');

    const move = calls['movement'][0] as { quantity: number };
    expect(move.quantity).toBe(60);

    // Reference buying price refreshed to the per-piece cost.
    const prodUpdate = calls['product.update'][0] as { buyingPrice: Prisma.Decimal };
    expect(prodUpdate.buyingPrice.toString()).toBe('500');
  });

  it('settles a cash purchase fully and links it to the open till', async () => {
    const { service, calls } = build();
    await service.create(baseDto({ paymentMethod: 'CASH' }), 'user1');

    const purchase = calls['purchase.create'][0] as {
      amountPaid: Prisma.Decimal;
      amountDue: Prisma.Decimal;
      cashSessionId: string;
    };
    expect(purchase.amountPaid.toString()).toBe('30000'); // 5 × 6000
    expect(purchase.amountDue.toString()).toBe('0');
    expect(purchase.cashSessionId).toBe('sess1');
    // No supplier payable grown for a cash purchase.
    expect(calls['supplier.update']).toBeUndefined();
  });

  it('grows the supplier payable for the unpaid portion of a credit purchase', async () => {
    const { service, calls } = build();
    await service.create(
      baseDto({ paymentMethod: 'CREDIT', amountPaid: 10000 }),
      'user1',
    );

    const purchase = calls['purchase.create'][0] as {
      amountPaid: Prisma.Decimal;
      amountDue: Prisma.Decimal;
    };
    expect(purchase.amountPaid.toString()).toBe('10000');
    expect(purchase.amountDue.toString()).toBe('20000');

    const supUpdate = calls['supplier.update'][0] as {
      data: { balance: { increment: Prisma.Decimal } };
    };
    expect(supUpdate.data.balance.increment.toString()).toBe('20000');
  });

  it('rejects a credit purchase with no supplier', async () => {
    const { service } = build();
    await expect(
      service.create(baseDto({ paymentMethod: 'CREDIT', supplierId: undefined }), 'user1'),
    ).rejects.toThrow(/supplier is required/i);
  });

  it('returns the original purchase on a repeated idempotency key', async () => {
    const { service, prisma } = build();
    (prisma.purchase.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'pur1',
      purchaseNumber: 'PUR-1',
    });
    const result = await service.create(baseDto(), 'user1', 'key-123');
    expect((result as { id: string }).id).toBe('pur1');
    // Short-circuited before opening a transaction.
    expect(prisma.runSerializable).not.toHaveBeenCalled();
  });
});
