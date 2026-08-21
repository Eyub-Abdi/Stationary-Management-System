import { BadRequestException } from '@nestjs/common';
import { Prisma, StockAdjustmentReason } from '@prisma/client';
import Decimal from 'decimal.js';
import { InventoryAdminService } from './inventory-admin.service';

/**
 * Unit tests for hand-made stock changes. The point of interest is `costImpact`:
 * a write-off must carry the FIFO cost of the batches it actually consumed, or
 * the loss never reaches the profit figures. Prisma and the FIFO engine are
 * mocked — no database is touched.
 */
describe('InventoryAdminService', () => {
  const variant = {
    id: 'v1',
    productId: 'p1',
    buyingPrice: new Prisma.Decimal(100),
    sellingPrice: new Prisma.Decimal(250),
    product: { baseUnit: 'sheet', bulkUnit: 'Ream', unitSize: 500 },
  };

  const build = (
    opts: {
      fifoCost?: number;
      components?: { variantId: string; qty: number; perPage: boolean }[];
      serviceVariant?: unknown;
    } = {},
  ) => {
    // Prisma's create data, captured loosely — these are assertions about
    // values, not about Prisma's generated input types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const created: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const movements: any[] = [];

    const tx = {
      productVariant: {
        findUnique: jest.fn().mockResolvedValue(variant),
      },
      inventoryAdjustment: {
        create: jest.fn().mockImplementation(({ data }) => {
          created.push(data);
          return Promise.resolve({ id: `adj${created.length}`, ...data });
        }),
      },
    } as unknown as Prisma.TransactionClient;

    const prisma = {
      runSerializable: jest.fn().mockImplementation((cb) => cb(tx)),
      serviceVariant: {
        findUnique: jest.fn().mockResolvedValue(
          opts.serviceVariant === undefined
            ? {
                id: 'sv1',
                components: opts.components ?? [
                  { variantId: 'v1', qty: 1, perPage: true },
                ],
              }
            : opts.serviceVariant,
        ),
      },
    };

    const inventory = {
      addBatchTx: jest.fn().mockResolvedValue('batch1'),
      consumeFifoTx: jest.fn().mockResolvedValue({
        allocations: [],
        totalCost: new Decimal(opts.fifoCost ?? 0),
      }),
      applyMovementTx: jest.fn().mockImplementation((_tx, p) => {
        movements.push(p);
        return Promise.resolve({ beforeQty: 500, afterQty: 500 + p.quantity });
      }),
    };
    const audit = { recordTx: jest.fn().mockResolvedValue(undefined) };

    const service = new InventoryAdminService(
      prisma as never,
      inventory as never,
      audit as never,
    );
    return { service, created, movements, inventory, prisma };
  };

  describe('adjust', () => {
    it('costs a write-off from the FIFO batches it consumed, not the reference price', async () => {
      // 20 sheets off the shelf; the batches they came from cost 1,700 in total,
      // which is not 20 × the 100 reference buying price.
      const { service, created } = build({ fifoCost: 1700 });

      await service.adjust(
        {
          variantId: 'v1',
          quantityChange: -20,
          reasonCode: StockAdjustmentReason.DAMAGED,
        },
        'u1',
      );

      expect(created[0].costImpact.toString()).toBe('-1700');
      expect(created[0].reasonCode).toBe('DAMAGED');
    });

    it('fills a blank note with the label of the chosen reason', async () => {
      const { service, created } = build({ fifoCost: 500 });

      await service.adjust(
        {
          variantId: 'v1',
          quantityChange: -5,
          reasonCode: StockAdjustmentReason.JAM,
        },
        'u1',
      );

      expect(created[0].reason).toBe('Printer jam / misprint');
    });

    it('records a positive adjustment at the cost of the batch it creates', async () => {
      const { service, created, inventory } = build();

      await service.adjust(
        {
          variantId: 'v1',
          quantityChange: 10,
          reasonCode: StockAdjustmentReason.FOUND,
          unitCost: 120,
        },
        'u1',
      );

      expect(inventory.addBatchTx).toHaveBeenCalled();
      expect(created[0].costImpact.toString()).toBe('1200');
    });

    it('refuses to drive stock negative', async () => {
      const { service, movements } = build({ fifoCost: 100 });

      await service.adjust(
        {
          variantId: 'v1',
          quantityChange: -5,
          reasonCode: StockAdjustmentReason.LOST,
        },
        'u1',
      );

      expect(movements[0].allowNegative).toBeFalsy();
    });
  });

  describe('recordWastage', () => {
    it('spreads a spoiled print job over the service bill of materials', async () => {
      // "Printing A4" eats 1 sheet per page; 3 pages jammed = 3 sheets gone.
      const { service, created, inventory } = build({ fifoCost: 300 });

      const result = await service.recordWastage(
        {
          serviceVariantId: 'sv1',
          quantity: 3,
          reasonCode: StockAdjustmentReason.JAM,
        },
        'u1',
      );

      expect(inventory.consumeFifoTx).toHaveBeenCalledWith(
        expect.anything(),
        'v1',
        3,
        { allowShortfall: true },
      );
      expect(created[0].quantityChange).toBe(-3);
      expect(created[0].serviceVariantId).toBe('sv1');
      expect(result.totalCost).toBe('300.00');
    });

    it('charges a per-job component once however many pages spoiled', async () => {
      const { service, created } = build({
        fifoCost: 50,
        components: [
          { variantId: 'v1', qty: 1, perPage: true },
          { variantId: 'v2', qty: 1, perPage: false }, // e.g. a binding cover
        ],
      });

      await service.recordWastage(
        {
          serviceVariantId: 'sv1',
          quantity: 8,
          reasonCode: StockAdjustmentReason.JAM,
        },
        'u1',
      );

      expect(created.map((c) => c.quantityChange)).toEqual([-8, -1]);
    });

    it('lets stock go negative rather than refusing the entry', async () => {
      // The paper is gone whether or not the system agreed it was there.
      const { service, movements } = build({ fifoCost: 0 });

      await service.recordWastage(
        { variantId: 'v1', quantity: 4, reasonCode: StockAdjustmentReason.SPOILED },
        'u1',
      );

      expect(movements[0].allowNegative).toBe(true);
    });

    it('rejects an entry that names both a service and a product', async () => {
      const { service } = build();

      await expect(
        service.recordWastage(
          {
            serviceVariantId: 'sv1',
            variantId: 'v1',
            quantity: 1,
            reasonCode: StockAdjustmentReason.JAM,
          },
          'u1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a service option with no bill of materials to draw from', async () => {
      const { service } = build({ components: [] });

      await expect(
        service.recordWastage(
          { serviceVariantId: 'sv1', quantity: 1, reasonCode: StockAdjustmentReason.JAM },
          'u1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
