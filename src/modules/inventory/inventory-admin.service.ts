import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryMovementType,
  Prisma,
  StockAdjustmentReason,
} from '@prisma/client';
import Decimal from 'decimal.js';
import { paginate } from '../../common/dto/pagination.dto';
import { resolveOrderBy, SortMap } from '../../common/utils/sort';
import { add, money, mul, round, toPrisma } from '../../common/utils/money';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { isOpeningStock, REASON_LABELS } from './adjustment-reasons';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { MovementQueryDto } from './dto/movement-query.dto';
import { RecordOpeningStockDto } from './dto/opening-stock.dto';
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
  /**
   * How the ledger should name this movement. Opening stock reads as OPENING so
   * the movement log tells day-one stock apart from a later correction.
   */
  movementType?: InventoryMovementType;
  /**
   * Dates the FIFO batch a positive change creates. Stock counted at setup is
   * dated to the count, so it is consumed before anything bought after it.
   */
  batchDate?: Date;
  /**
   * The selling price the variant will carry once this call succeeds, for the
   * cost guard. Defaults to the price it carries now.
   */
  sellingPrice?: Decimal;
}

/** One recorded line of the day-one shelf, as the setup screen reads it back. */
export interface OpeningStockLine {
  adjustmentId: string;
  variantId: string;
  name: string;
  quantity: number;
  unitLabel: string;
  unitSize: number;
  basePieces: number;
  unitCost: string;
  lineValue: string;
}

/**
 * Admin-facing inventory operations (manual adjustments, ledger queries,
 * stock valuation). Adjustments run in a Serializable transaction and produce a
 * full audit trail: InventoryAdjustment + InventoryMovement + AuditLog, plus a
 * FIFO batch for positive adjustments / FIFO consumption for negative ones.
 */
/** Columns the stock-movement log can be ordered by. */
const MOVEMENT_SORTS: SortMap<Prisma.InventoryMovementOrderByWithRelationInput[]> = {
  createdAt: (dir) => [{ createdAt: dir }],
  product: (dir) => [{ product: { name: dir } }],
  type: (dir) => [{ type: dir }, { createdAt: 'desc' }],
  quantity: (dir) => [{ quantity: dir }],
  afterQty: (dir) => [{ afterQty: dir }],
};

@Injectable()
export class InventoryAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
  ) {}

  async adjust(dto: AdjustStockDto, userId: string) {
    // Opening stock has its own screen, and routing it through here would take
    // the shortcut that caused the problem: one variant at a time, no cost per
    // pack, and the reason left to whoever is typing.
    if (isOpeningStock(dto.reasonCode)) {
      throw new BadRequestException(
        'Stock that was already on the shelf at setup goes through Opening Stock, not an adjustment.',
      );
    }
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
      // from the form or from the buyingPrice fallback above. Judged against
      // the price the variant is about to carry, so a line that sets the
      // selling price in the same breath is measured against the new one.
      assertCostPerBaseUnit(
        unitCost,
        input.sellingPrice ?? money(variant.sellingPrice),
        variant.product,
      );
      await this.inventory.addBatchTx(tx, {
        variantId: input.variantId,
        productId,
        quantity: input.quantityChange,
        unitCost,
        purchaseDate: input.batchDate ?? new Date(),
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
      type: input.movementType ?? 'ADJUSTMENT',
      quantity: input.quantityChange,
      userId,
      referenceType: input.movementType ?? 'ADJUSTMENT',
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

  /**
   * Records the shelf as it stood on the day the shop started using the system.
   *
   * This exists because there was no honest way to enter it. A purchase takes
   * the money out of today's till — a shop opening with 74m of stock ended up
   * with a drawer expected to hold minus 74m, and every banking after it
   * blocked. A positive adjustment is read by the profit figures as the
   * opposite of wastage, so the same 74m came back as 74m of profit nobody
   * earned. Neither is what happened: the stock is real and cost real money,
   * but that money left long before today, and none of it is a loss.
   *
   * So opening stock is costed like a purchase — packs divided down to pieces,
   * FIFO batches dated to the count — and then excluded from every trading
   * figure. What it does affect is COGS: the first sale off that shelf reports
   * what the goods actually cost, which is the entire point of entering a cost.
   *
   * One entry per variant. A second one is almost always someone recounting
   * rather than a genuine second opening, and silently doubling the shelf is
   * far worse than a message saying so.
   */
  async recordOpeningStock(dto: RecordOpeningStockDto, userId: string) {
    const countedAt = dto.countedAt ?? new Date();
    const variantIds = new Set<string>();
    for (const item of dto.items) {
      if (variantIds.has(item.variantId)) {
        throw new BadRequestException(
          'The same product is listed twice. Combine the lines into one.',
        );
      }
      variantIds.add(item.variantId);
    }

    return this.prisma.runSerializable(async (tx) => {
      const variants = await tx.productVariant.findMany({
        where: { id: { in: [...variantIds] } },
        select: {
          id: true,
          label: true,
          productId: true,
          sellingPrice: true,
          product: {
            select: { name: true, baseUnit: true, bulkUnit: true, unitSize: true },
          },
        },
      });
      const byId = new Map(variants.map((v) => [v.id, v]));

      const already = await tx.inventoryAdjustment.findMany({
        where: {
          variantId: { in: [...variantIds] },
          reasonCode: StockAdjustmentReason.OPENING_STOCK,
        },
        select: { variantId: true, createdAt: true },
      });

      const lines: OpeningStockLine[] = [];
      let totalValue = money(0);

      for (const item of dto.items) {
        const variant = byId.get(item.variantId);
        if (!variant) {
          throw new NotFoundException(`Variant ${item.variantId} not found`);
        }
        const product = variant.product;
        const name =
          variant.label && variant.label !== 'Default'
            ? `${product.name} — ${variant.label}`
            : product.name;

        const prior = already.find((a) => a.variantId === item.variantId);
        if (prior) {
          throw new ConflictException(
            `Opening stock for ${name} was already recorded on ` +
              `${prior.createdAt.toISOString().slice(0, 10)}. ` +
              'Correct the quantity with a stock count correction instead.',
          );
        }

        const unitSize = item.unitSize ?? 1;
        const unitLabel = item.unitLabel?.trim() || product.baseUnit;
        const basePieces = item.quantity * unitSize;
        // Per-base-unit cost is what FIFO consumes in, and what COGS is read
        // from for as long as the batch lasts.
        const pieceCost = round(money(item.unitCost).dividedBy(unitSize));

        // A variant with no price cannot be sold, and setup is exactly the
        // moment to give it one rather than discovering it at the counter.
        if (item.sellingPrice === undefined && money(variant.sellingPrice).isZero()) {
          throw new BadRequestException(
            `Set a selling price for ${name}. It has no price yet.`,
          );
        }
        const sellingPrice =
          item.sellingPrice !== undefined
            ? money(item.sellingPrice)
            : money(variant.sellingPrice);

        assertCostPerBaseUnit(pieceCost, sellingPrice, product, {
          item: name,
          remedy:
            unitSize > 1
              ? `Check the pack size (${unitSize}) and the cost of one ${unitLabel}.`
              : `If ${money(item.unitCost).toFixed(2)} is the price of a ${product.bulkUnit ?? 'pack'}, set how many ${product.baseUnit} it holds.`,
        });

        const adjustment = await this.writeAdjustmentTx(
          tx,
          {
            variantId: item.variantId,
            quantityChange: basePieces,
            reasonCode: StockAdjustmentReason.OPENING_STOCK,
            reason: dto.notes?.trim() || REASON_LABELS.OPENING_STOCK,
            unitCost: pieceCost.toNumber(),
            movementType: InventoryMovementType.OPENING,
            batchDate: countedAt,
            sellingPrice,
          },
          userId,
        );

        // Setup is also where the shop's reference prices come from, so the
        // cost and price entered here become the variant's own.
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: {
            buyingPrice: toPrisma(pieceCost),
            ...(item.sellingPrice !== undefined
              ? { sellingPrice: toPrisma(item.sellingPrice) }
              : {}),
            ...(item.wholesalePrice !== undefined
              ? { wholesalePrice: toPrisma(item.wholesalePrice) }
              : {}),
          },
        });

        const lineValue = mul(pieceCost, basePieces);
        totalValue = add(totalValue, lineValue);
        lines.push({
          adjustmentId: adjustment.id,
          variantId: item.variantId,
          name,
          quantity: item.quantity,
          unitLabel,
          unitSize,
          basePieces,
          unitCost: pieceCost.toFixed(2),
          lineValue: lineValue.toFixed(2),
        });
      }

      await this.audit.recordTx(tx, {
        userId,
        action: 'OPENING_STOCK_RECORDED',
        entityType: 'InventoryAdjustment',
        entityId: lines[0].adjustmentId,
        metadata: {
          countedAt: countedAt.toISOString(),
          lineCount: lines.length,
          totalValue: totalValue.toFixed(2),
          notes: dto.notes ?? null,
        },
      });

      return {
        countedAt,
        lineCount: lines.length,
        totalValue: totalValue.toFixed(2),
        lines,
      };
    });
  }

  /**
   * What has already been entered as opening stock, so the setup screen can
   * show what is done and the shop can see what it started with.
   */
  async listOpeningStock() {
    const rows = await this.prisma.inventoryAdjustment.findMany({
      where: { reasonCode: StockAdjustmentReason.OPENING_STOCK },
      orderBy: { createdAt: 'desc' },
      include: {
        product: { select: { name: true, baseUnit: true } },
        variant: { select: { sku: true, label: true } },
        user: { select: { fullName: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      variantId: r.variantId,
      sku: r.variant.sku,
      name:
        r.variant.label && r.variant.label !== 'Default'
          ? `${r.product.name} — ${r.variant.label}`
          : r.product.name,
      baseUnit: r.product.baseUnit,
      quantity: r.quantityChange,
      unitCost: r.unitCost ? money(r.unitCost).toFixed(2) : null,
      value: money(r.costImpact ?? 0).toFixed(2),
      recordedBy: r.user?.fullName ?? null,
      createdAt: r.createdAt,
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
        orderBy: resolveOrderBy(query, MOVEMENT_SORTS, [{ createdAt: 'desc' }]),
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
