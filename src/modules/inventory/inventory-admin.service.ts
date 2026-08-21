import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StockAdjustmentReason } from '@prisma/client';
import Decimal from 'decimal.js';
import { paginate } from '../../common/dto/pagination.dto';
import { add, money, mul, toPrisma } from '../../common/utils/money';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { REASON_LABELS } from './adjustment-reasons';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { MovementQueryDto } from './dto/movement-query.dto';
import { RecordWastageDto } from './dto/record-wastage.dto';
import { InventoryService } from './inventory.service';
import { assertCostPerBaseUnit } from './unit-cost-guard';

/** One stock change to write, already resolved down to a single variant. */
interface AdjustmentInput {
  variantId: string;
  /** Signed: +in / -out. */
  quantityChange: number;
  reasonCode: StockAdjustmentReason;
  reason?: string;
  unitCost?: number;
  serviceVariantId?: string;
  /** Let stock go below zero rather than refusing — see recordWastage. */
  allowShortfall?: boolean;
}

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
    return this.prisma.runSerializable((tx) =>
      this.writeAdjustmentTx(tx, dto, userId),
    );
  }

  /**
   * Writes one stock adjustment: the FIFO side, the ledger movement, the
   * adjustment row and the audit entry, all inside the caller's transaction.
   *
   * The FIFO side is what makes the loss real money. A negative adjustment
   * consumes the same batches a sale would, and the cost of those batches is
   * kept on the row as `costImpact` — so a write-off reaches the profit figures
   * at what the stock actually cost, not at a reference price.
   */
  private async writeAdjustmentTx(
    tx: Prisma.TransactionClient,
    input: AdjustmentInput,
    userId: string,
  ) {
    const variant = await tx.productVariant.findUnique({
      where: { id: input.variantId },
      include: {
        product: {
          select: { baseUnit: true, bulkUnit: true, unitSize: true },
        },
      },
    });
    if (!variant) throw new NotFoundException('Variant not found');
    const productId = variant.productId;

    // For positive adjustments we add a costed FIFO batch.
    // For negative adjustments we consume FIFO to keep valuation correct.
    let costImpact: Decimal;
    let movementUnitCost: Decimal | null;
    if (input.quantityChange > 0) {
      const unitCost = money(input.unitCost ?? variant.buyingPrice);
      // Catches a pack price typed into a per-piece field, whether it came
      // from the form or from the buyingPrice fallback above.
      assertCostPerBaseUnit(
        unitCost,
        money(variant.sellingPrice),
        variant.product,
      );
      await this.inventory.addBatchTx(tx, {
        variantId: input.variantId,
        productId,
        quantity: input.quantityChange,
        unitCost,
        purchaseDate: new Date(),
      });
      costImpact = mul(unitCost, input.quantityChange);
      movementUnitCost = unitCost;
    } else {
      const qty = -input.quantityChange;
      const fifo = await this.inventory.consumeFifoTx(tx, input.variantId, qty, {
        allowShortfall: input.allowShortfall,
      });
      // Negative: value has left the shelf.
      costImpact = fifo.totalCost.negated();
      // Blended cost of the batches actually consumed, so the ledger row shows
      // what the written-off units cost rather than nothing at all.
      movementUnitCost = fifo.totalCost.isZero()
        ? null
        : fifo.totalCost.dividedBy(qty);
    }

    const reason = input.reason?.trim() || REASON_LABELS[input.reasonCode];

    const { beforeQty, afterQty } = await this.inventory.applyMovementTx(tx, {
      variantId: input.variantId,
      productId,
      type: 'ADJUSTMENT',
      quantity: input.quantityChange,
      userId,
      referenceType: 'ADJUSTMENT',
      notes: reason,
      unitCost: movementUnitCost,
      // Only wastage recorded against a job may drive stock negative; a manual
      // adjustment that overshoots is a mistake worth stopping.
      allowNegative: input.allowShortfall,
    });

    const adjustment = await tx.inventoryAdjustment.create({
      data: {
        variantId: input.variantId,
        productId,
        userId,
        quantityChange: input.quantityChange,
        beforeQty,
        afterQty,
        reasonCode: input.reasonCode,
        reason,
        unitCost: input.unitCost ? money(input.unitCost).toFixed(2) : null,
        costImpact: toPrisma(costImpact),
        serviceVariantId: input.serviceVariantId ?? null,
      },
    });

    await this.audit.recordTx(tx, {
      userId,
      action: 'INVENTORY_ADJUSTED',
      entityType: 'ProductVariant',
      entityId: input.variantId,
      metadata: {
        adjustmentId: adjustment.id,
        quantityChange: input.quantityChange,
        beforeQty,
        afterQty,
        reasonCode: input.reasonCode,
        reason,
        costImpact: costImpact.toFixed(2),
        ...(input.serviceVariantId
          ? { serviceVariantId: input.serviceVariantId }
          : {}),
      },
    });

    return adjustment;
  }

  /**
   * Records stock destroyed during work — the printer jams, sheets are ruined.
   *
   * Given a service option, the loss is spread over that option's bill of
   * materials: three spoiled pages of "Printing A4" write off three sheets of
   * whichever paper the option consumes, exactly as selling three pages would.
   * Given a product, it writes that product off directly.
   *
   * Shortfalls are allowed. The paper is gone whether or not the system agreed
   * it was there, and refusing the entry would only teach staff not to bother.
   */
  async recordWastage(dto: RecordWastageDto, userId: string) {
    if (!dto.serviceVariantId === !dto.variantId) {
      throw new BadRequestException(
        'Give either a serviceVariantId or a variantId, not both.',
      );
    }

    const targets = dto.serviceVariantId
      ? await this.resolveServiceWastage(dto.serviceVariantId, dto.quantity)
      : [{ variantId: dto.variantId!, quantity: dto.quantity }];

    return this.prisma.runSerializable(async (tx) => {
      const adjustments = [];
      let totalCost = money(0);
      for (const t of targets) {
        const adjustment = await this.writeAdjustmentTx(
          tx,
          {
            variantId: t.variantId,
            quantityChange: -t.quantity,
            reasonCode: dto.reasonCode,
            reason: dto.notes,
            serviceVariantId: dto.serviceVariantId,
            allowShortfall: true,
          },
          userId,
        );
        adjustments.push(adjustment);
        totalCost = add(totalCost, money(adjustment.costImpact ?? 0).negated());
      }
      return { adjustments, totalCost: totalCost.toFixed(2) };
    });
  }

  /**
   * Turns "3 pages spoiled on Printing A4" into the products that cost.
   * Per-page components scale with the page count; per-job components are
   * charged once, since one ruined job consumes one job's worth of them.
   */
  private async resolveServiceWastage(
    serviceVariantId: string,
    quantity: number,
  ) {
    const serviceVariant = await this.prisma.serviceVariant.findUnique({
      where: { id: serviceVariantId },
      include: { components: true },
    });
    if (!serviceVariant) throw new NotFoundException('Service option not found');
    if (serviceVariant.components.length === 0) {
      throw new BadRequestException(
        'This service option consumes no products, so there is nothing to write off.',
      );
    }
    return serviceVariant.components.map((c) => ({
      variantId: c.variantId,
      quantity: c.qty * (c.perPage ? quantity : 1),
    }));
  }

  async listMovements(query: MovementQueryDto) {
    const where: Prisma.InventoryMovementWhereInput = {
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.type ? { type: query.type } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.inventoryMovement.findMany({
        where,
        include: {
          product: { select: { sku: true, name: true } },
          variant: { select: { sku: true, label: true } },
        },
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
