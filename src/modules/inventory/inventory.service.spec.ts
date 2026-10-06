import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InventoryService } from './inventory.service';

/**
 * Unit tests for the FIFO costing engine. We mock the Prisma transaction client
 * so the tests are pure and fast — they assert ordering, partial draw-down,
 * exact COGS, and the insufficient-stock guard.
 */
describe('InventoryService (FIFO engine)', () => {
  let service: InventoryService;

  beforeEach(() => {
    service = new InventoryService();
  });

  const makeTx = (
    batches: { id: string; remainingQuantity: number; unitCost: number }[],
  ) => {
    const updates: { id: string; data: unknown }[] = [];
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue(
        batches.map((b) => ({
          id: b.id,
          remainingQuantity: b.remainingQuantity,
          unitCost: new Prisma.Decimal(b.unitCost),
        })),
      ),
      inventoryBatch: {
        update: jest.fn().mockImplementation(({ where, data }) => {
          updates.push({ id: where.id, data: data.remainingQuantity });
          return Promise.resolve({});
        }),
      },
    } as unknown as Prisma.TransactionClient;
    return { tx, updates };
  };

  it('draws from the oldest batch first and computes exact COGS', async () => {
    // Brief example: 100 @ 500 then 100 @ 700; sell 120 => 100*500 + 20*700.
    const { tx, updates } = makeTx([
      { id: 'b1', remainingQuantity: 100, unitCost: 500 },
      { id: 'b2', remainingQuantity: 100, unitCost: 700 },
    ]);

    const res = await service.consumeFifoTx(tx, 'p1', 120);

    expect(res.totalCost.toString()).toBe('64000');
    expect(res.allocations).toHaveLength(2);
    expect(res.allocations[0]).toMatchObject({ batchId: 'b1', quantity: 100 });
    expect(res.allocations[1]).toMatchObject({ batchId: 'b2', quantity: 20 });
    expect(res.allocations[0].cost.toString()).toBe('50000');
    expect(res.allocations[1].cost.toString()).toBe('14000');
    // b1 fully drained to 0, b2 reduced to 80.
    expect(updates).toEqual([
      { id: 'b1', data: 0 },
      { id: 'b2', data: 80 },
    ]);
  });

  it('consumes entirely from one batch when it suffices', async () => {
    const { tx } = makeTx([{ id: 'b1', remainingQuantity: 100, unitCost: 500 }]);
    const res = await service.consumeFifoTx(tx, 'p1', 50);
    expect(res.totalCost.toString()).toBe('25000');
    expect(res.allocations).toHaveLength(1);
  });

  it('throws when stock across all batches is insufficient', async () => {
    const { tx } = makeTx([{ id: 'b1', remainingQuantity: 30, unitCost: 500 }]);
    await expect(service.consumeFifoTx(tx, 'p1', 50)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects non-positive consumption', async () => {
    const { tx } = makeTx([{ id: 'b1', remainingQuantity: 30, unitCost: 500 }]);
    await expect(service.consumeFifoTx(tx, 'p1', 0)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('restores returned quantities back to their batches', async () => {
    const { tx, updates } = makeTx([]);
    await service.restoreFifoTx(tx, [
      { batchId: 'b1', quantity: 10 },
      { batchId: 'b2', quantity: 5 },
    ]);
    expect(updates).toEqual([
      { id: 'b1', data: { increment: 10 } },
      { id: 'b2', data: { increment: 5 } },
    ]);
  });

  describe('applyMovementTx', () => {
    const makeMoveTx = (currentStock: number) =>
      ({
        $queryRaw: jest.fn().mockResolvedValue([{ currentStock }]),
        productVariant: { update: jest.fn().mockResolvedValue({}) },
        inventoryMovement: { create: jest.fn().mockResolvedValue({}) },
      }) as unknown as Prisma.TransactionClient;

    it('lets stock come in onto a negative balance, even if it stays negative', async () => {
      const tx = makeMoveTx(-52);
      const res = await service.applyMovementTx(tx, {
        variantId: 'v1',
        productId: 'p1',
        type: 'PURCHASE',
        quantity: 20,
      });
      expect(res).toEqual({ beforeQty: -52, afterQty: -32 });
    });

    it('still blocks a removal that would go below zero', async () => {
      const tx = makeMoveTx(5);
      await expect(
        service.applyMovementTx(tx, {
          variantId: 'v1',
          productId: 'p1',
          type: 'SALE',
          quantity: -10,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
