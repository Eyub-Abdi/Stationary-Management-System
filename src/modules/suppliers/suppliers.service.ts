import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginate, PaginationQueryDto } from '../../common/dto/pagination.dto';
import { money, sub, toPrisma } from '../../common/utils/money';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateSupplierDto,
  RecordSupplierPaymentDto,
  UpdateSupplierDto,
} from './dto/supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  create(dto: CreateSupplierDto) {
    return this.prisma.supplier.create({ data: dto });
  }

  async findAll(query: PaginationQueryDto & { withBalance?: boolean }) {
    const where: Prisma.SupplierWhereInput = {
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
      ...(query.withBalance ? { balance: { gt: 0 } } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.supplier.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.supplier.count({ where }),
    ]);
    return paginate(data, total, query.page, query.limit);
  }

  /**
   * Aggregate payables across all suppliers — total we owe, how many creditors
   * we owe, the single largest debt, and the supplier count.
   */
  async summary() {
    const [agg, weOweCount, supplierCount] = await this.prisma.$transaction([
      this.prisma.supplier.aggregate({
        _sum: { balance: true },
        _max: { balance: true },
      }),
      this.prisma.supplier.count({ where: { balance: { gt: 0 } } }),
      this.prisma.supplier.count(),
    ]);
    return {
      totalPayable: agg._sum.balance ?? new Prisma.Decimal(0),
      largestDebt: agg._max.balance ?? new Prisma.Decimal(0),
      weOweCount,
      supplierCount,
    };
  }

  async findOne(id: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: {
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { user: { select: { fullName: true } } },
        },
      },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  async update(id: string, dto: UpdateSupplierDto) {
    await this.ensureExists(id);
    return this.prisma.supplier.update({ where: { id }, data: dto });
  }

  /**
   * Records a payment made to a supplier against our payable balance. Decrements
   * the balance and books the cash OUT of the user's open session.
   */
  async recordPayment(
    supplierId: string,
    dto: RecordSupplierPaymentDto,
    userId: string,
    idempotencyKey?: string,
  ) {
    // Idempotency: a repeated request returns the original payment + balance.
    if (idempotencyKey) {
      const existing = await this.prisma.supplierPayment.findUnique({
        where: { idempotencyKey },
        include: { supplier: { select: { balance: true } } },
      });
      if (existing) {
        return { payment: existing, balance: existing.supplier.balance.toString() };
      }
    }

    return this.prisma.runSerializable(async (tx) => {
      if (idempotencyKey) {
        const dup = await tx.supplierPayment.findUnique({
          where: { idempotencyKey },
          include: { supplier: { select: { balance: true } } },
        });
        if (dup) return { payment: dup, balance: dup.supplier.balance.toString() };
      }

      const supplier = await tx.supplier.findUnique({ where: { id: supplierId } });
      if (!supplier) throw new NotFoundException('Supplier not found');

      const amount = money(dto.amount);
      const balance = money(supplier.balance);
      if (balance.lessThanOrEqualTo(0)) {
        throw new BadRequestException('We owe this supplier nothing.');
      }
      if (amount.greaterThan(balance)) {
        throw new BadRequestException(
          `Payment (${amount.toFixed(2)}) exceeds the amount owed (${balance.toFixed(2)}).`,
        );
      }

      const session = await tx.cashSession.findFirst({
        where: { userId, status: 'OPEN' },
        orderBy: { openedAt: 'desc' },
      });
      if (!session) {
        throw new BadRequestException(
          'No open cash session. Open one before paying a supplier from the till.',
        );
      }

      if (dto.purchaseId) {
        const purchase = await tx.purchase.findUnique({
          where: { id: dto.purchaseId },
        });
        if (!purchase || purchase.supplierId !== supplierId) {
          throw new BadRequestException(
            'The referenced purchase does not belong to this supplier.',
          );
        }
      }

      const payment = await tx.supplierPayment.create({
        data: {
          supplierId,
          userId,
          cashSessionId: session.id,
          purchaseId: dto.purchaseId,
          amount: toPrisma(amount),
          notes: dto.notes,
          idempotencyKey,
        },
      });

      const newBalance = sub(balance, amount);
      await tx.supplier.update({
        where: { id: supplierId },
        data: { balance: toPrisma(newBalance) },
      });

      await this.audit.recordTx(tx, {
        userId,
        action: 'SUPPLIER_PAYMENT',
        entityType: 'Supplier',
        entityId: supplierId,
        metadata: {
          amount: toPrisma(amount).toString(),
          newBalance: toPrisma(newBalance).toString(),
          purchaseId: dto.purchaseId ?? null,
        },
      });

      return { payment, balance: toPrisma(newBalance).toString() };
    });
  }

  async payments(supplierId: string, query: PaginationQueryDto) {
    await this.ensureExists(supplierId);
    const where: Prisma.SupplierPaymentWhereInput = { supplierId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.supplierPayment.findMany({
        where,
        include: { user: { select: { fullName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.supplierPayment.count({ where }),
    ]);
    return paginate(data, total, query.page, query.limit);
  }

  private async ensureExists(id: string) {
    const exists = await this.prisma.supplier.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Supplier not found');
  }
}
