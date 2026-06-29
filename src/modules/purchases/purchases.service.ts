import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { paginate, PaginationQueryDto } from '../../common/dto/pagination.dto';
import { add, money, mul, round, sub, toPrisma } from '../../common/utils/money';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { SequenceService } from '../shared/sequence.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly sequences: SequenceService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Records a purchase atomically: creates the purchase + items, a FIFO batch
   * per line (in BASE units), increments stock via the movement ledger,
   * refreshes each product's reference buying price, settles payment (CASH or
   * CREDIT — credit grows the supplier's payable), and writes an audit row —
   * all inside one Serializable transaction. Stock can never drift from batches.
   */
  async create(dto: CreatePurchaseDto, userId: string, idempotencyKey?: string) {
    if (dto.items.length === 0) {
      throw new BadRequestException('A purchase must contain at least one item');
    }

    const paymentMethod = dto.paymentMethod ?? 'CASH';
    if (paymentMethod === 'CREDIT' && !dto.supplierId) {
      throw new BadRequestException(
        'A supplier is required for credit purchases.',
      );
    }

    // Idempotency: a repeated request returns the original purchase.
    if (idempotencyKey) {
      const existing = await this.prisma.purchase.findUnique({
        where: { idempotencyKey },
        include: { items: true, supplier: true },
      });
      if (existing) return existing;
    }

    return this.prisma.runSerializable(async (tx) => {
      if (idempotencyKey) {
        const dup = await tx.purchase.findUnique({
          where: { idempotencyKey },
          include: { items: true, supplier: true },
        });
        if (dup) return dup;
      }

      // Link the cash portion to the recorder's open till (if any), so a cash
      // purchase reduces that session's expected cash at close.
      const session = await tx.cashSession.findFirst({
        where: { userId, status: 'OPEN' },
        orderBy: { openedAt: 'desc' },
        select: { id: true },
      });
      // Validate variants up-front (with their product's dual-unit config).
      const variantIds = [...new Set(dto.items.map((i) => i.variantId))];
      const variants = await tx.productVariant.findMany({
        where: { id: { in: variantIds } },
        select: {
          id: true,
          label: true,
          productId: true,
          sellingPrice: true,
          product: { select: { name: true, baseUnit: true, bulkUnit: true, unitSize: true } },
        },
      });
      const byId = new Map(variants.map((v) => [v.id, v]));
      for (const id of variantIds) {
        if (!byId.has(id)) {
          throw new NotFoundException(`Variant ${id} not found`);
        }
      }

      if (dto.supplierId) {
        const supplier = await tx.supplier.findUnique({
          where: { id: dto.supplierId },
        });
        if (!supplier) throw new NotFoundException('Supplier not found');
      }

      const purchaseNumber = await this.sequences.next(
        tx,
        'PURCHASE',
        dto.purchaseDate,
      );

      // Resolve per-line units and totals first.
      const resolved = dto.items.map((item) => {
        const variant = byId.get(item.variantId)!;
        const product = variant.product;
        const sellUnit = item.sellUnit ?? 'BASE';
        let unitSize = 1;
        let unitLabel = product.baseUnit;
        if (sellUnit === 'BULK') {
          const size = item.unitSize ?? 0;
          if (size < 2) {
            throw new BadRequestException(
              `Enter how many pieces are in each pack for ${product.name} (2 or more).`,
            );
          }
          unitSize = size;
          unitLabel = item.unitLabel?.trim() || 'pack';
        }
        const lineTotal = mul(item.unitCost, item.quantity);
        const basePieces = item.quantity * unitSize;
        // Per-base-unit cost drives FIFO COGS (round to 2dp for storage).
        const pieceCost = round(money(item.unitCost).dividedBy(unitSize));
        const nameSnapshot =
          variant.label && variant.label !== 'Default'
            ? `${product.name} — ${variant.label}`
            : product.name;
        // A variant priced at 0 has never been given a selling price; the first
        // stock-in must set one so it is sellable at the counter.
        if (item.sellingPrice === undefined && money(variant.sellingPrice).isZero()) {
          throw new BadRequestException(
            `Set a selling price for ${nameSnapshot} — it has no price yet.`,
          );
        }
        return { item, variant, unitSize, unitLabel, lineTotal, basePieces, pieceCost, nameSnapshot };
      });

      const totalCost = resolved.reduce((a, r) => add(a, r.lineTotal), money(0));

      // Settle payment.
      let amountPaid: Decimal;
      if (paymentMethod === 'CASH') {
        amountPaid = totalCost;
      } else {
        amountPaid = money(dto.amountPaid ?? 0);
        if (amountPaid.greaterThan(totalCost)) {
          throw new BadRequestException(
            `Amount paid (${amountPaid.toFixed(2)}) cannot exceed total cost (${totalCost.toFixed(2)})`,
          );
        }
      }
      const amountDue = sub(totalCost, amountPaid);

      const purchase = await tx.purchase.create({
        data: {
          purchaseNumber,
          supplierId: dto.supplierId,
          userId,
          cashSessionId: session?.id,
          purchaseDate: dto.purchaseDate,
          totalCost: toPrisma(totalCost),
          paymentMethod,
          amountPaid: toPrisma(amountPaid),
          amountDue: toPrisma(amountDue),
          notes: dto.notes,
          idempotencyKey,
        },
      });

      for (const r of resolved) {
        const purchaseItem = await tx.purchaseItem.create({
          data: {
            purchaseId: purchase.id,
            productId: r.variant.productId,
            variantId: r.variant.id,
            productNameSnapshot: r.nameSnapshot,
            quantity: r.item.quantity,
            unitLabel: r.unitLabel,
            unitSize: r.unitSize,
            unitCost: toPrisma(r.item.unitCost),
            lineTotal: toPrisma(r.lineTotal),
          },
        });

        await this.inventory.addBatchTx(tx, {
          variantId: r.variant.id,
          productId: r.variant.productId,
          quantity: r.basePieces,
          unitCost: r.pieceCost,
          purchaseDate: dto.purchaseDate,
          purchaseId: purchase.id,
          purchaseItemId: purchaseItem.id,
        });

        await this.inventory.applyMovementTx(tx, {
          variantId: r.variant.id,
          productId: r.variant.productId,
          type: 'PURCHASE',
          quantity: r.basePieces,
          userId,
          referenceType: 'PURCHASE',
          referenceId: purchase.id,
          unitCost: r.pieceCost,
        });

        // Refresh the variant's reference buying price (per base unit), and
        // re-tag the selling price when this purchase set a new one.
        await tx.productVariant.update({
          where: { id: r.variant.id },
          data: {
            buyingPrice: toPrisma(r.pieceCost),
            ...(r.item.sellingPrice !== undefined
              ? { sellingPrice: toPrisma(r.item.sellingPrice) }
              : {}),
            ...(r.item.wholesalePrice !== undefined
              ? { wholesalePrice: toPrisma(r.item.wholesalePrice) }
              : {}),
          },
        });
      }

      // Credit purchase: grow the supplier's payable balance.
      if (dto.supplierId && amountDue.greaterThan(0)) {
        await tx.supplier.update({
          where: { id: dto.supplierId },
          data: { balance: { increment: toPrisma(amountDue) } },
        });
      }

      await this.audit.recordTx(tx, {
        userId,
        action: 'PURCHASE_CREATED',
        entityType: 'Purchase',
        entityId: purchase.id,
        metadata: {
          purchaseNumber,
          paymentMethod,
          totalCost: toPrisma(totalCost).toString(),
          amountPaid: toPrisma(amountPaid).toString(),
          amountDue: toPrisma(amountDue).toString(),
          lineCount: dto.items.length,
        },
      });

      return tx.purchase.findUniqueOrThrow({
        where: { id: purchase.id },
        include: { items: true, supplier: true },
      });
    });
  }

  async findAll(query: PaginationQueryDto & { supplierId?: string }) {
    const where: Prisma.PurchaseWhereInput = {
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.search
        ? { purchaseNumber: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.purchase.findMany({
        where,
        include: { supplier: true, _count: { select: { items: true } } },
        orderBy: { purchaseDate: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.purchase.count({ where }),
    ]);
    return paginate(data, total, query.page, query.limit);
  }

  async findOne(id: string) {
    const purchase = await this.prisma.purchase.findUnique({
      where: { id },
      include: { items: true, supplier: true, user: { select: { fullName: true } } },
    });
    if (!purchase) throw new NotFoundException('Purchase not found');
    return purchase;
  }
}
