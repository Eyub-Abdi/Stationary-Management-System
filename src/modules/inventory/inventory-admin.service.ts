import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginate } from '../../common/dto/pagination.dto';
import { money } from '../../common/utils/money';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { MovementQueryDto } from './dto/movement-query.dto';
import { InventoryService } from './inventory.service';

/**
 * Admin-facing inventory operations (manual adjustments, ledger queries,
 * stock valuation). Adjustments run in a Serializable transaction and produce a
 * full audit trail: InventoryAdjustment + InventoryMovement + AuditLog, plus a
 * FIFO batch for positive adjustments / FIFO consumption for negative ones.
 */
@Injectable()
export class InventoryAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
  ) {}

  async adjust(dto: AdjustStockDto, userId: string) {
    return this.prisma.runSerializable(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: dto.productId },
      });
      if (!product) throw new NotFoundException('Product not found');

      // For positive adjustments we add a costed FIFO batch.
      // For negative adjustments we consume FIFO to keep valuation correct.
      if (dto.quantityChange > 0) {
        const unitCost = money(dto.unitCost ?? product.buyingPrice);
        await this.inventory.addBatchTx(tx, {
          productId: dto.productId,
          quantity: dto.quantityChange,
          unitCost,
          purchaseDate: new Date(),
        });
      } else {
        await this.inventory.consumeFifoTx(tx, dto.productId, -dto.quantityChange);
      }

      const { beforeQty, afterQty } = await this.inventory.applyMovementTx(tx, {
        productId: dto.productId,
        type: 'ADJUSTMENT',
        quantity: dto.quantityChange,
        userId,
        referenceType: 'ADJUSTMENT',
        notes: dto.reason,
        unitCost: dto.unitCost ? money(dto.unitCost) : null,
      });

      const adjustment = await tx.inventoryAdjustment.create({
        data: {
          productId: dto.productId,
          userId,
          quantityChange: dto.quantityChange,
          beforeQty,
          afterQty,
          reason: dto.reason,
          unitCost: dto.unitCost ? money(dto.unitCost).toFixed(2) : null,
        },
      });

      await this.audit.recordTx(tx, {
        userId,
        action: 'INVENTORY_ADJUSTED',
        entityType: 'Product',
        entityId: dto.productId,
        metadata: {
          adjustmentId: adjustment.id,
          quantityChange: dto.quantityChange,
          beforeQty,
          afterQty,
          reason: dto.reason,
        },
      });

      return adjustment;
    });
  }

  async listMovements(query: MovementQueryDto) {
    const where: Prisma.InventoryMovementWhereInput = {
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.type ? { type: query.type } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.inventoryMovement.findMany({
        where,
        include: { product: { select: { sku: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.inventoryMovement.count({ where }),
    ]);
    return paginate(data, total, query.page, query.limit);
  }

  /** Current inventory valuation from remaining FIFO batches. */
  async valuation() {
    const rows = await this.prisma.$queryRaw<
      { productId: string; sku: string; name: string; units: bigint; value: string }[]
    >(Prisma.sql`
      SELECT p.id          AS "productId",
             p.sku         AS sku,
             p.name        AS name,
             COALESCE(SUM(b."remainingQuantity"), 0)                       AS units,
             COALESCE(SUM(b."remainingQuantity" * b."unitCost"), 0)::text  AS value
      FROM products p
      LEFT JOIN inventory_batches b ON b."productId" = p.id
      GROUP BY p.id, p.sku, p.name
      ORDER BY p.name ASC;
    `);
    return rows.map((r) => ({
      productId: r.productId,
      sku: r.sku,
      name: r.name,
      units: Number(r.units),
      value: r.value,
    }));
  }
}
