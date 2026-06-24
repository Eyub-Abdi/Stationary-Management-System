import { ConflictException, Injectable } from '@nestjs/common';
import { InventoryMovementType, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { add, money, mul, toPrisma } from '../../common/utils/money';

export interface FifoAllocation {
  batchId: string;
  quantity: number;
  unitCost: Decimal;
  cost: Decimal;
}

export interface FifoResult {
  allocations: FifoAllocation[];
  totalCost: Decimal;
}

interface MovementInput {
  productId: string;
  type: InventoryMovementType;
  /** Signed: +in / -out. */
  quantity: number;
  userId?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  unitCost?: Decimal | null;
  notes?: string | null;
}

/**
 * The inventory engine. Every method here is TRANSACTION-AWARE: callers pass the
 * active Prisma.TransactionClient so stock changes commit atomically with the
 * originating sale/purchase/adjustment. All of these MUST run inside
 * PrismaService.runSerializable.
 */
@Injectable()
export class InventoryService {
  /**
   * Locks the product row (SELECT ... FOR UPDATE), computes before/after,
   * persists the new currentStock and appends an immutable movement row.
   * Returns the before/after quantities.
   */
  async applyMovementTx(
    tx: Prisma.TransactionClient,
    input: MovementInput,
  ): Promise<{ beforeQty: number; afterQty: number }> {
    const locked = await tx.$queryRaw<{ currentStock: number }[]>(Prisma.sql`
      SELECT "currentStock" FROM products WHERE id = ${input.productId}::uuid FOR UPDATE
    `);
    if (locked.length === 0) {
      throw new ConflictException('Product not found while moving stock');
    }
    const beforeQty = locked[0].currentStock;
    const afterQty = beforeQty + input.quantity;
    if (afterQty < 0) {
      throw new ConflictException(
        `Insufficient stock: have ${beforeQty}, attempted to remove ${-input.quantity}`,
      );
    }

    await tx.product.update({
      where: { id: input.productId },
      data: { currentStock: afterQty },
    });

    await tx.inventoryMovement.create({
      data: {
        productId: input.productId,
        type: input.type,
        quantity: input.quantity,
        beforeQty,
        afterQty,
        unitCost: input.unitCost ? toPrisma(input.unitCost) : null,
        userId: input.userId ?? null,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        notes: input.notes ?? null,
      },
    });

    return { beforeQty, afterQty };
  }

  /**
   * Creates a FIFO inventory batch (stock IN). Used by purchases and positive
   * adjustments. Does NOT touch currentStock — pair with applyMovementTx.
   */
  async addBatchTx(
    tx: Prisma.TransactionClient,
    params: {
      productId: string;
      quantity: number;
      unitCost: Decimal;
      purchaseDate: Date;
      purchaseId?: string;
      purchaseItemId?: string;
    },
  ): Promise<string> {
    const batch = await tx.inventoryBatch.create({
      data: {
        productId: params.productId,
        quantity: params.quantity,
        remainingQuantity: params.quantity,
        unitCost: toPrisma(params.unitCost),
        purchaseDate: params.purchaseDate,
        purchaseId: params.purchaseId,
        purchaseItemId: params.purchaseItemId,
      },
    });
    return batch.id;
  }

  /**
   * Consumes `quantity` units FIFO (oldest purchaseDate first). Locks candidate
   * batches FOR UPDATE, decrements remainingQuantity and returns the COGS
   * breakdown. Throws if stock is insufficient. Does NOT touch currentStock —
   * pair with applyMovementTx.
   */
  async consumeFifoTx(
    tx: Prisma.TransactionClient,
    productId: string,
    quantity: number,
  ): Promise<FifoResult> {
    if (quantity <= 0) {
      throw new ConflictException('Quantity to consume must be positive');
    }

    const batches = await tx.$queryRaw<
      { id: string; remainingQuantity: number; unitCost: Prisma.Decimal }[]
    >(Prisma.sql`
      SELECT id, "remainingQuantity", "unitCost"
      FROM inventory_batches
      WHERE "productId" = ${productId}::uuid AND "remainingQuantity" > 0
      ORDER BY "purchaseDate" ASC, "createdAt" ASC
      FOR UPDATE
    `);

    const allocations: FifoAllocation[] = [];
    let remaining = quantity;
    let totalCost = money(0);

    for (const batch of batches) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, batch.remainingQuantity);
      const unitCost = money(batch.unitCost);
      const cost = mul(unitCost, take);

      allocations.push({ batchId: batch.id, quantity: take, unitCost, cost });
      totalCost = add(totalCost, cost);
      remaining -= take;

      await tx.inventoryBatch.update({
        where: { id: batch.id },
        data: { remainingQuantity: batch.remainingQuantity - take },
      });
    }

    if (remaining > 0) {
      throw new ConflictException(
        `Insufficient inventory batches to fulfill ${quantity} units (short by ${remaining})`,
      );
    }

    return { allocations, totalCost };
  }

  /**
   * Restores previously consumed FIFO quantities back to their batches.
   * Used when voiding/reversing a sale so COGS and stock are exactly undone.
   */
  async restoreFifoTx(
    tx: Prisma.TransactionClient,
    allocations: { batchId: string; quantity: number }[],
  ): Promise<void> {
    for (const alloc of allocations) {
      await tx.inventoryBatch.update({
        where: { id: alloc.batchId },
        data: { remainingQuantity: { increment: alloc.quantity } },
      });
    }
  }
}
