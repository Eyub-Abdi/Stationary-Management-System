import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SaleItemType } from '@prisma/client';
import Decimal from 'decimal.js';
import { paginate } from '../../common/dto/pagination.dto';
import { add, money, mul, round, sub, toPrisma } from '../../common/utils/money';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountingPeriodsService } from '../accounting/accounting-periods.service';
import { AuditService } from '../audit/audit.service';
import { CustomersService } from '../customers/customers.service';
import { InventoryService } from '../inventory/inventory.service';
import { SequenceService } from '../shared/sequence.service';
import { CreateSaleDto, SaleItemInputDto } from './dto/create-sale.dto';
import { ReturnSaleDto } from './dto/return-sale.dto';
import { SaleQueryDto } from './dto/sale-query.dto';

interface ComputedLine {
  itemType: SaleItemType;
  productId?: string;
  variantId?: string;
  serviceId?: string;
  serviceVariantId?: string;
  nameSnapshot: string;
  unitPriceSnapshot: Decimal;
  quantity: number;
  // Unit of measure the line was sold in.
  unitLabel: string;
  unitSize: number;
  // Base units (pieces) drawn from inventory = quantity * unitSize (products only).
  basePieces: number;
  pages?: number;
  discount: Decimal;
  lineGross: Decimal;
  lineTotal: Decimal;
  // For a service line: the products it consumes (its bill of materials), each a
  // whole base-unit quantity to draw down FIFO.
  consumptions: { variantId: string; productId: string; qty: number }[];
}

const SALE_INCLUDE = {
  items: { include: { allocations: true } },
  returns: { include: { items: true } },
  user: { select: { id: true, fullName: true } },
  customer: { select: { id: true, name: true, phone: true } },
} satisfies Prisma.SaleInclude;

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly sequences: SequenceService,
    private readonly audit: AuditService,
    private readonly customers: CustomersService,
    private readonly periods: AccountingPeriodsService,
  ) {}

  /**
   * Creates a completed sale atomically:
   *  - snapshots product/service name, unit of measure + unit price (immutable),
   *  - computes line totals & order discount with Decimal math,
   *  - consumes inventory FIFO in BASE units and records exact COGS allocations,
   *  - writes stock-out movements,
   *  - settles payment: CASH validates cash >= total (change returned); CREDIT
   *    requires a customer, records the down payment and adds the balance owing
   *    to the customer's receivable,
   *  - reserves gapless invoice & transaction numbers and records an audit row.
   * Idempotency: a repeated request carrying the same idempotency key returns
   * the original sale instead of creating a duplicate.
   */
  async create(
    dto: CreateSaleDto,
    userId: string,
    idempotencyKey?: string,
  ) {
    if (idempotencyKey) {
      const existing = await this.prisma.sale.findUnique({
        where: { idempotencyKey },
        include: SALE_INCLUDE,
      });
      if (existing) return existing;
    }

    const paymentMethod = dto.paymentMethod ?? 'CASH';

    return this.prisma.runSerializable(async (tx) => {
      // Re-check idempotency inside the transaction to close the race window.
      if (idempotencyKey) {
        const dup = await tx.sale.findUnique({
          where: { idempotencyKey },
          include: SALE_INCLUDE,
        });
        if (dup) return dup;
      }

      // A sale is attributed to the exact OPEN session the cashier named, not
      // "whatever session they happen to have open" — so a stale/foreign
      // session can't silently absorb the sale.
      const session = await this.resolveOpenSession(
        tx,
        dto.cashSessionId,
        userId,
      );

      // Validate the debtor for credit sales (credit-limit check happens once
      // the payable amount is known, below).
      let customerId: string | undefined;
      let customer: { id: string; name: string; isActive: boolean; balance: Prisma.Decimal; creditLimit: Prisma.Decimal | null } | null = null;
      if (paymentMethod === 'CREDIT') {
        if (!dto.customerId) {
          throw new BadRequestException(
            'A customer is required for credit sales.',
          );
        }
        customer = await tx.customer.findUnique({ where: { id: dto.customerId } });
        if (!customer) throw new NotFoundException('Customer not found');
        if (!customer.isActive) {
          throw new ForbiddenException(`Customer ${customer.name} is inactive`);
        }
        customerId = customer.id;
      }

      const lines = await this.computeLines(tx, dto.items);

      const subtotal = lines.reduce<Decimal>((a, l) => add(a, l.lineGross), money(0));
      const lineDiscounts = lines.reduce<Decimal>((a, l) => add(a, l.discount), money(0));
      const orderDiscount = money(dto.orderDiscount ?? 0);
      const discountTotal = add(lineDiscounts, orderDiscount);
      const total = sub(subtotal, discountTotal);

      if (total.isNegative()) {
        throw new BadRequestException('Discounts exceed the order subtotal');
      }

      const cashReceived = money(dto.cashReceived);

      // Settle payment per method.
      let amountPaid: Decimal;
      let changeGiven: Decimal;
      let amountDue: Decimal;
      if (paymentMethod === 'CASH') {
        if (cashReceived.lessThan(total)) {
          throw new BadRequestException(
            `Cash received (${cashReceived.toFixed(2)}) is less than total (${total.toFixed(2)})`,
          );
        }
        amountPaid = total;
        changeGiven = sub(cashReceived, total);
        amountDue = money(0);
      } else {
        // CREDIT: cashReceived is the (optional) down payment; no change given.
        if (cashReceived.greaterThan(total)) {
          throw new BadRequestException(
            `Down payment (${cashReceived.toFixed(2)}) cannot exceed total (${total.toFixed(2)})`,
          );
        }
        amountPaid = cashReceived;
        changeGiven = money(0);
        amountDue = sub(total, amountPaid);

        // Enforce the customer's credit limit on the new receivable.
        if (customer?.creditLimit != null && amountDue.greaterThan(0)) {
          const projected = add(money(customer.balance), amountDue);
          if (projected.greaterThan(money(customer.creditLimit))) {
            const available = sub(money(customer.creditLimit), money(customer.balance));
            throw new BadRequestException(
              `Credit limit exceeded for ${customer.name}. Available credit ${available.toFixed(2)}, this sale adds ${amountDue.toFixed(2)}.`,
            );
          }
        }
      }

      const now = new Date();
      const invoiceNumber = await this.sequences.next(tx, 'INVOICE', now);
      const transactionNumber = await this.sequences.next(tx, 'TRANSACTION', now);

      const sale = await tx.sale.create({
        data: {
          invoiceNumber,
          transactionNumber,
          userId,
          cashSessionId: session.id,
          customerId,
          paymentMethod,
          subtotal: toPrisma(subtotal),
          discountTotal: toPrisma(discountTotal),
          total: toPrisma(total),
          amountPaid: toPrisma(amountPaid),
          amountDue: toPrisma(amountDue),
          cashReceived: toPrisma(cashReceived),
          changeGiven: toPrisma(changeGiven),
          notes: dto.notes,
          idempotencyKey,
          // totalCogs filled after FIFO consumption below.
        },
      });

      let totalCogs = money(0);

      for (const line of lines) {
        let lineCogs = money(0);
        // Product-line FIFO draws from the sold variant itself.
        let productAllocations: { batchId: string; quantity: number; unitCost: Decimal; cost: Decimal }[] = [];

        if (line.itemType === 'PRODUCT') {
          const fifo = await this.inventory.consumeFifoTx(
            tx,
            line.variantId!,
            line.basePieces,
          );
          lineCogs = fifo.totalCost;
          productAllocations = fifo.allocations;

          await this.inventory.applyMovementTx(tx, {
            variantId: line.variantId!,
            productId: line.productId!,
            type: 'SALE',
            quantity: -line.basePieces,
            userId,
            referenceType: 'SALE',
            referenceId: sale.id,
          });
        }

        const saleItem = await tx.saleItem.create({
          data: {
            saleId: sale.id,
            itemType: line.itemType,
            productId: line.productId,
            variantId: line.variantId,
            serviceId: line.serviceId,
            serviceVariantId: line.serviceVariantId,
            nameSnapshot: line.nameSnapshot,
            unitPriceSnapshot: toPrisma(line.unitPriceSnapshot),
            quantity: line.quantity,
            unitLabel: line.unitLabel,
            unitSize: line.unitSize,
            pages: line.pages,
            discount: toPrisma(line.discount),
            lineTotal: toPrisma(line.lineTotal),
            // Filled below (services accumulate cost across consumed products).
            lineCogs: toPrisma(lineCogs),
          },
        });

        for (const a of productAllocations) {
          await tx.cogsAllocation.create({
            data: {
              saleItemId: saleItem.id,
              batchId: a.batchId,
              quantity: a.quantity,
              unitCost: toPrisma(a.unitCost),
              cost: toPrisma(a.cost),
            },
          });
        }

        // A service line draws down every product in its bill of materials.
        // Warn-but-allow: consume what's in stock (for COGS) and let stock go
        // negative if short, snapshotting each product so a void can restore it.
        for (const c of line.consumptions) {
          const fifo = await this.inventory.consumeFifoTx(tx, c.variantId, c.qty, {
            allowShortfall: true,
          });
          const consumption = await tx.saleItemConsumption.create({
            data: {
              saleItemId: saleItem.id,
              variantId: c.variantId,
              productId: c.productId,
              qty: c.qty,
              cogs: toPrisma(fifo.totalCost),
            },
          });
          for (const a of fifo.allocations) {
            await tx.cogsAllocation.create({
              data: {
                saleItemId: saleItem.id,
                saleItemConsumptionId: consumption.id,
                batchId: a.batchId,
                quantity: a.quantity,
                unitCost: toPrisma(a.unitCost),
                cost: toPrisma(a.cost),
              },
            });
          }
          await this.inventory.applyMovementTx(tx, {
            variantId: c.variantId,
            productId: c.productId,
            type: 'SALE',
            quantity: -c.qty,
            userId,
            referenceType: 'SALE',
            referenceId: sale.id,
            allowNegative: true,
          });
          lineCogs = add(lineCogs, fifo.totalCost);
        }

        // Persist the final line COGS once all consumed products are tallied.
        if (line.consumptions.length > 0) {
          await tx.saleItem.update({
            where: { id: saleItem.id },
            data: { lineCogs: toPrisma(lineCogs) },
          });
        }

        totalCogs = add(totalCogs, lineCogs);
      }

      // Credit sale: grow the customer's outstanding receivable.
      if (customerId && amountDue.greaterThan(0)) {
        await tx.customer.update({
          where: { id: customerId },
          data: { balance: { increment: toPrisma(amountDue) } },
        });
      }

      const finalized = await tx.sale.update({
        where: { id: sale.id },
        data: { totalCogs: toPrisma(totalCogs) },
        include: SALE_INCLUDE,
      });

      await this.audit.recordTx(tx, {
        userId,
        action: 'SALE_CREATED',
        entityType: 'Sale',
        entityId: sale.id,
        metadata: {
          invoiceNumber,
          transactionNumber,
          paymentMethod,
          total: toPrisma(total).toString(),
          amountPaid: toPrisma(amountPaid).toString(),
          amountDue: toPrisma(amountDue).toString(),
          totalCogs: toPrisma(totalCogs).toString(),
          itemCount: lines.length,
        },
      });

      return finalized;
    });
  }

  /**
   * Voids a completed sale (immutable correction). Restores the exact FIFO
   * quantities consumed, writes RETURN movements, reverses any outstanding
   * credit balance, flags the sale VOIDED and audits the action.
   */
  async void(id: string, reason: string, userId: string) {
    return this.prisma.runSerializable(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id },
        include: {
          items: { include: { allocations: true, consumptions: true } },
          _count: { select: { returns: true } },
        },
      });
      if (!sale) throw new NotFoundException('Sale not found');
      if (sale.status === 'VOIDED') {
        throw new ConflictException('Sale is already voided');
      }
      if (sale._count.returns > 0) {
        throw new ConflictException(
          'Sale has partial returns; void is not allowed. Reverse via returns instead.',
        );
      }
      // Voiding removes the sale from its month's revenue — refuse once those
      // books are closed. A return (dated today) is the correct reversal there.
      await this.periods.assertOpen(sale.createdAt, 'this sale');

      for (const item of sale.items) {
        // Every allocation on the line (product line, or one per consumed product
        // on a service line) is restored to its batch — batches self-identify.
        if (item.allocations.length > 0) {
          await this.inventory.restoreFifoTx(
            tx,
            item.allocations.map((a) => ({ batchId: a.batchId, quantity: a.quantity })),
          );
        }

        if (item.itemType === 'PRODUCT') {
          const restoreQty = item.quantity * item.unitSize;
          if (!item.variantId || !item.productId || restoreQty <= 0) continue;
          await this.inventory.applyMovementTx(tx, {
            variantId: item.variantId,
            productId: item.productId,
            type: 'RETURN',
            quantity: restoreQty,
            userId,
            referenceType: 'SALE_VOID',
            referenceId: sale.id,
            notes: reason,
            // Restoring stock only adds; never block it if the balance is still negative.
            allowNegative: true,
          });
        } else {
          // Service line: return each consumed product to stock.
          for (const c of item.consumptions) {
            if (c.qty <= 0) continue;
            await this.inventory.applyMovementTx(tx, {
              variantId: c.variantId,
              productId: c.productId,
              type: 'RETURN',
              quantity: c.qty,
              userId,
              referenceType: 'SALE_VOID',
              referenceId: sale.id,
              notes: reason,
              allowNegative: true,
            });
          }
        }
      }

      // Unwind the receivable created by a credit sale (clamp at 0).
      if (sale.customerId && money(sale.amountDue).greaterThan(0)) {
        const customer = await tx.customer.findUnique({
          where: { id: sale.customerId },
          select: { balance: true },
        });
        if (customer) {
          const newBalance = sub(customer.balance, money(sale.amountDue));
          await tx.customer.update({
            where: { id: sale.customerId },
            data: { balance: toPrisma(newBalance.isNegative() ? money(0) : newBalance) },
          });
        }
      }

      const voided = await tx.sale.update({
        where: { id },
        // Clearing the receivable keeps balance == SUM(amountDue) consistent.
        data: { status: 'VOIDED', voidedAt: new Date(), voidReason: reason, amountDue: toPrisma(0) },
        include: SALE_INCLUDE,
      });

      await this.audit.recordTx(tx, {
        userId,
        action: 'SALE_VOIDED',
        entityType: 'Sale',
        entityId: sale.id,
        metadata: { invoiceNumber: sale.invoiceNumber, reason },
      });

      return voided;
    });
  }

  /**
   * Partial return / refund. Returns specific quantities of specific lines:
   *  - restocks returned product units back into their exact FIFO batches,
   *  - reverses the corresponding historical COGS (via CogsAllocation),
   *  - refunds the net (post-discount) amount from the till,
   *  - records an immutable SaleReturn (the sale itself stays COMPLETED).
   * A line can be returned across multiple returns up to its sold quantity.
   */
  async returnSale(saleId: string, dto: ReturnSaleDto, userId: string) {
    return this.prisma.runSerializable(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id: saleId },
        include: { items: { include: { allocations: true } }, customer: true },
      });
      if (!sale) throw new NotFoundException('Sale not found');
      if (sale.status === 'VOIDED') {
        throw new ConflictException('Cannot return a voided sale');
      }

      const session = await this.resolveOpenSession(
        tx,
        dto.cashSessionId,
        userId,
      );

      const byId = new Map(sale.items.map((i) => [i.id, i]));
      // Reject duplicate line ids in one request.
      const seen = new Set<string>();

      const ret = await tx.saleReturn.create({
        data: {
          returnNumber: await this.sequences.next(tx, 'RETURN'),
          saleId: sale.id,
          userId,
          cashSessionId: session.id,
          reason: dto.reason,
          totalRefund: toPrisma(0),
          totalCogsReversed: toPrisma(0),
        },
      });

      let totalRefund = money(0);
      let totalCogsReversed = money(0);

      for (const line of dto.items) {
        if (seen.has(line.saleItemId)) {
          throw new BadRequestException('Duplicate sale item in return request');
        }
        seen.add(line.saleItemId);

        const item = byId.get(line.saleItemId);
        if (!item) {
          throw new BadRequestException(
            `Sale item ${line.saleItemId} does not belong to this sale`,
          );
        }
        const remaining = item.quantity - item.returnedQuantity;
        if (line.quantity > remaining) {
          throw new BadRequestException(
            `Cannot return ${line.quantity} of "${item.nameSnapshot}"; only ${remaining} remain returnable`,
          );
        }

        // Net (post-discount) unit price → refund (per transacted unit).
        const unitNet = money(item.lineTotal).dividedBy(item.quantity);
        const refund = round(mul(unitNet, line.quantity));

        let cogsReversed = money(0);
        if (item.itemType === 'PRODUCT' && item.productId && item.variantId) {
          // Inventory is tracked in base units; convert returned units to pieces.
          let toRestore = line.quantity * item.unitSize;
          for (const alloc of item.allocations) {
            if (toRestore <= 0) break;
            const avail = alloc.quantity - alloc.returnedQuantity;
            const take = Math.min(avail, toRestore);
            if (take <= 0) continue;

            await tx.inventoryBatch.update({
              where: { id: alloc.batchId },
              data: { remainingQuantity: { increment: take } },
            });
            await tx.cogsAllocation.update({
              where: { id: alloc.id },
              data: { returnedQuantity: alloc.returnedQuantity + take },
            });
            cogsReversed = add(cogsReversed, mul(alloc.unitCost, take));
            toRestore -= take;
          }

          await this.inventory.applyMovementTx(tx, {
            variantId: item.variantId,
            productId: item.productId,
            type: 'RETURN',
            quantity: line.quantity * item.unitSize,
            userId,
            referenceType: 'SALE_RETURN',
            referenceId: ret.id,
            notes: dto.reason,
          });
        }

        await tx.saleItem.update({
          where: { id: item.id },
          data: { returnedQuantity: item.returnedQuantity + line.quantity },
        });

        await tx.saleReturnItem.create({
          data: {
            returnId: ret.id,
            saleItemId: item.id,
            quantity: line.quantity,
            refundAmount: toPrisma(refund),
            cogsReversed: toPrisma(cogsReversed),
          },
        });

        totalRefund = add(totalRefund, refund);
        totalCogsReversed = add(totalCogsReversed, cogsReversed);
      }

      // For a credit sale to a customer who still owes us, apply the refund to
      // their outstanding invoices first (store credit) — this sale first, then
      // oldest. Only the surplus is refunded in cash.
      let creditApplied = money(0);
      if (sale.customerId && sale.customer) {
        const balance = money(sale.customer.balance);
        creditApplied = Decimal.min(totalRefund, balance);
        if (creditApplied.greaterThan(0)) {
          await this.customers.allocateToInvoices(
            tx,
            sale.customerId,
            creditApplied,
            sale.id,
          );
          await tx.customer.update({
            where: { id: sale.customerId },
            data: { balance: { decrement: toPrisma(creditApplied) } },
          });
        }
      }

      const finalized = await tx.saleReturn.update({
        where: { id: ret.id },
        data: {
          totalRefund: toPrisma(totalRefund),
          creditApplied: toPrisma(creditApplied),
          totalCogsReversed: toPrisma(totalCogsReversed),
        },
        include: { items: true },
      });

      await this.audit.recordTx(tx, {
        userId,
        action: 'SALE_RETURNED',
        entityType: 'Sale',
        entityId: sale.id,
        metadata: {
          returnNumber: finalized.returnNumber,
          totalRefund: toPrisma(totalRefund).toString(),
          creditApplied: toPrisma(creditApplied).toString(),
          cashRefunded: toPrisma(sub(totalRefund, creditApplied)).toString(),
          totalCogsReversed: toPrisma(totalCogsReversed).toString(),
          reason: dto.reason,
        },
      });

      return finalized;
    });
  }

  async findAll(query: SaleQueryDto) {
    const where: Prisma.SaleWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.paymentMethod ? { paymentMethod: query.paymentMethod } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.from || query.to
        ? { createdAt: { gte: query.from, lte: query.to } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { invoiceNumber: { contains: query.search, mode: 'insensitive' } },
              { transactionNumber: { contains: query.search, mode: 'insensitive' } },
              { user: { fullName: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.sale.findMany({
        where,
        include: {
          user: { select: { fullName: true } },
          customer: { select: { name: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.sale.count({ where }),
    ]);
    return paginate(data, total, query.page, query.limit);
  }

  async findOne(id: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: SALE_INCLUDE,
    });
    if (!sale) throw new NotFoundException('Sale not found');
    return sale;
  }

  // ---- internals ----------------------------------------------------------

  /**
   * Resolves the cash session a sale/refund is attributed to. The caller must
   * name a session that (a) exists, (b) belongs to them, and (c) is still OPEN.
   * This prevents recording money against a session the operator doesn't have
   * actively selected — e.g. a lingering open session from a prior shift, or
   * another cashier's till.
   */
  private async resolveOpenSession(
    tx: Prisma.TransactionClient,
    cashSessionId: string,
    userId: string,
  ) {
    const session = await tx.cashSession.findUnique({
      where: { id: cashSessionId },
      select: { id: true, userId: true, status: true },
    });
    if (!session || session.userId !== userId) {
      throw new BadRequestException(
        'No open cash session. Open a cash session before recording sales.',
      );
    }
    if (session.status !== 'OPEN') {
      throw new BadRequestException(
        'Your cash session is closed. Open a new session before recording sales.',
      );
    }
    return session;
  }

  /** Validates each line and computes prices from current catalog snapshots. */
  private async computeLines(
    tx: Prisma.TransactionClient,
    items: SaleItemInputDto[],
  ): Promise<ComputedLine[]> {
    const lines: ComputedLine[] = [];

    for (const item of items) {
      const discount = money(item.discount ?? 0);

      if (item.itemType === 'PRODUCT') {
        if (!item.variantId) {
          throw new BadRequestException('variantId is required for PRODUCT lines');
        }
        const variant = await tx.productVariant.findUnique({
          where: { id: item.variantId },
          include: { product: true },
        });
        if (!variant) throw new NotFoundException(`Variant ${item.variantId} not found`);
        const product = variant.product;
        if (product.status !== 'ACTIVE' || variant.status !== 'ACTIVE') {
          throw new ForbiddenException(`${product.name} is inactive`);
        }

        const displayName =
          variant.label && variant.label !== 'Default'
            ? `${product.name} — ${variant.label}`
            : product.name;

        // Everything sells by the piece (unitSize 1). BULK = the wholesale price tier.
        const sellUnit = item.sellUnit ?? 'BASE';
        const unitSize = 1;
        const unitLabel = product.baseUnit;
        let unitPrice: Decimal;

        if (sellUnit === 'BULK') {
          if (!variant.wholesalePrice || money(variant.wholesalePrice).isZero()) {
            throw new BadRequestException(`${displayName} has no wholesale price set.`);
          }
          unitPrice = money(variant.wholesalePrice);
        } else {
          unitPrice = money(variant.sellingPrice);
        }

        const lineGross = mul(unitPrice, item.quantity);
        this.assertDiscount(discount, lineGross, displayName);

        lines.push({
          itemType: 'PRODUCT',
          productId: product.id,
          variantId: variant.id,
          nameSnapshot: displayName,
          unitPriceSnapshot: unitPrice,
          quantity: item.quantity,
          unitLabel,
          unitSize,
          basePieces: item.quantity * unitSize,
          discount,
          lineGross,
          lineTotal: sub(lineGross, discount),
          consumptions: [],
        });
      } else {
        if (!item.serviceVariantId) {
          throw new BadRequestException('serviceVariantId is required for SERVICE lines');
        }
        const serviceVariant = await tx.serviceVariant.findUnique({
          where: { id: item.serviceVariantId },
          include: {
            service: true,
            components: {
              include: { variant: { select: { id: true, productId: true } } },
            },
          },
        });
        if (!serviceVariant) throw new NotFoundException(`Service option ${item.serviceVariantId} not found`);
        const service = serviceVariant.service;
        if (service.status !== 'ACTIVE' || serviceVariant.status !== 'ACTIVE') {
          throw new ForbiddenException(`${service.name} is inactive`);
        }
        const displayName =
          serviceVariant.label && serviceVariant.label !== 'Standard'
            ? `${service.name} — ${serviceVariant.label}`
            : service.name;
        const unitPrice = money(serviceVariant.unitPrice);

        let lineGross: Decimal;
        let pages: number | undefined;
        if (service.pricingType === 'PER_PAGE') {
          if (!item.pages || item.pages < 1) {
            throw new BadRequestException(
              `${displayName} is priced per page; "pages" is required`,
            );
          }
          pages = item.pages;
          lineGross = mul(mul(unitPrice, pages), item.quantity);
        } else {
          lineGross = mul(unitPrice, item.quantity);
        }
        this.assertDiscount(discount, lineGross, displayName);

        // Draw down every product in the option's bill of materials:
        // qty × pages (perPage) or × 1 (per job), × quantity sold.
        const consumptions = serviceVariant.components
          .map((c) => ({
            variantId: c.variant.id,
            productId: c.variant.productId,
            qty: c.qty * (c.perPage ? (pages ?? 1) : 1) * item.quantity,
          }))
          .filter((c) => c.qty > 0);

        lines.push({
          itemType: 'SERVICE',
          serviceId: service.id,
          serviceVariantId: serviceVariant.id,
          nameSnapshot: displayName,
          unitPriceSnapshot: unitPrice,
          quantity: item.quantity,
          unitLabel: 'job',
          unitSize: 1,
          basePieces: 0,
          pages,
          consumptions,
          discount,
          lineGross,
          lineTotal: sub(lineGross, discount),
        });
      }
    }

    return lines;
  }

  private assertDiscount(discount: Decimal, lineGross: Decimal, name: string) {
    if (discount.greaterThan(lineGross)) {
      throw new BadRequestException(`Discount exceeds line total for "${name}"`);
    }
  }
}
