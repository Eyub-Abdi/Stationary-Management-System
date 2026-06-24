import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { paginate, PaginationQueryDto } from '../../common/dto/pagination.dto';
import { money, sub, toPrisma } from '../../common/utils/money';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateCustomerDto,
  RecordCustomerPaymentDto,
  UpdateCustomerDto,
} from './dto/customer.dto';

/** A single invoice a payment/credit was applied to. */
export interface InvoiceAllocation {
  saleId: string;
  amount: Decimal;
}

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  create(dto: CreateCustomerDto) {
    return this.prisma.customer.create({
      data: {
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        creditLimit: dto.creditLimit != null ? toPrisma(dto.creditLimit) : null,
      },
    });
  }

  /**
   * Applies `amount` to the customer's outstanding invoices, oldest-first (an
   * earmarked sale, if given, is settled first). Decrements each sale's
   * amountDue and returns the per-invoice breakdown. Caller decrements the
   * customer's denormalized balance. Maintains balance == SUM(amountDue).
   */
  async allocateToInvoices(
    tx: Prisma.TransactionClient,
    customerId: string,
    amount: Decimal,
    preferSaleId?: string,
  ): Promise<InvoiceAllocation[]> {
    if (amount.lessThanOrEqualTo(0)) return [];

    const open = await tx.sale.findMany({
      where: { customerId, status: 'COMPLETED', amountDue: { gt: 0 } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, amountDue: true },
    });
    const ordered = preferSaleId
      ? [...open.filter((s) => s.id === preferSaleId), ...open.filter((s) => s.id !== preferSaleId)]
      : open;

    const allocations: InvoiceAllocation[] = [];
    let remaining = amount;
    for (const sale of ordered) {
      if (remaining.lessThanOrEqualTo(0)) break;
      const apply = Decimal.min(remaining, money(sale.amountDue));
      if (apply.lessThanOrEqualTo(0)) continue;
      await tx.sale.update({
        where: { id: sale.id },
        data: { amountDue: { decrement: toPrisma(apply) } },
      });
      allocations.push({ saleId: sale.id, amount: apply });
      remaining = sub(remaining, apply);
    }
    return allocations;
  }

  async findAll(query: PaginationQueryDto & { withBalance?: boolean }) {
    const where: Prisma.CustomerWhereInput = {
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      // Only customers who currently owe money.
      ...(query.withBalance ? { balance: { gt: 0 } } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.customer.count({ where }),
    ]);
    return paginate(data, total, query.page, query.limit);
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        sales: {
          where: { paymentMethod: 'CREDIT' },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            invoiceNumber: true,
            total: true,
            amountPaid: true,
            amountDue: true,
            status: true,
            createdAt: true,
          },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { user: { select: { fullName: true } } },
        },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto) {
    await this.ensureExists(id);
    return this.prisma.customer.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.creditLimit !== undefined
          ? { creditLimit: dto.creditLimit === null ? null : toPrisma(dto.creditLimit) }
          : {}),
      },
    });
  }

  /**
   * Records a repayment from a customer against their outstanding receivable.
   * Decrements the balance and books the cash into the user's open session.
   */
  async recordPayment(
    customerId: string,
    dto: RecordCustomerPaymentDto,
    userId: string,
    idempotencyKey?: string,
  ) {
    // Idempotency: a repeated request returns the original payment + balance.
    if (idempotencyKey) {
      const existing = await this.prisma.customerPayment.findUnique({
        where: { idempotencyKey },
        include: { customer: { select: { balance: true } } },
      });
      if (existing) {
        return { payment: existing, balance: existing.customer.balance.toString() };
      }
    }

    return this.prisma.runSerializable(async (tx) => {
      if (idempotencyKey) {
        const dup = await tx.customerPayment.findUnique({
          where: { idempotencyKey },
          include: { customer: { select: { balance: true } } },
        });
        if (dup) return { payment: dup, balance: dup.customer.balance.toString() };
      }

      const customer = await tx.customer.findUnique({ where: { id: customerId } });
      if (!customer) throw new NotFoundException('Customer not found');

      const amount = money(dto.amount);
      const balance = money(customer.balance);
      if (balance.lessThanOrEqualTo(0)) {
        throw new BadRequestException('This customer has no outstanding balance.');
      }
      if (amount.greaterThan(balance)) {
        throw new BadRequestException(
          `Payment (${amount.toFixed(2)}) exceeds the outstanding balance (${balance.toFixed(2)}).`,
        );
      }

      // Cash received must land in the staff member's open till.
      const session = await tx.cashSession.findFirst({
        where: { userId, status: 'OPEN' },
        orderBy: { openedAt: 'desc' },
      });
      if (!session) {
        throw new BadRequestException(
          'No open cash session. Open one before receiving a payment.',
        );
      }

      if (dto.saleId) {
        const sale = await tx.sale.findUnique({ where: { id: dto.saleId } });
        if (!sale || sale.customerId !== customerId) {
          throw new BadRequestException(
            'The referenced sale does not belong to this customer.',
          );
        }
      }

      const payment = await tx.customerPayment.create({
        data: {
          customerId,
          userId,
          cashSessionId: session.id,
          saleId: dto.saleId,
          amount: toPrisma(amount),
          notes: dto.notes,
          idempotencyKey,
        },
      });

      // Allocate across invoices (earmarked sale first, then oldest).
      const allocations = await this.allocateToInvoices(
        tx,
        customerId,
        amount,
        dto.saleId,
      );
      for (const a of allocations) {
        await tx.customerPaymentAllocation.create({
          data: { paymentId: payment.id, saleId: a.saleId, amount: toPrisma(a.amount) },
        });
      }

      const newBalance = sub(balance, amount);
      await tx.customer.update({
        where: { id: customerId },
        data: { balance: toPrisma(newBalance) },
      });

      await this.audit.recordTx(tx, {
        userId,
        action: 'CUSTOMER_PAYMENT',
        entityType: 'Customer',
        entityId: customerId,
        metadata: {
          amount: toPrisma(amount).toString(),
          newBalance: toPrisma(newBalance).toString(),
          invoicesSettled: allocations.length,
          saleId: dto.saleId ?? null,
        },
      });

      return { payment, balance: toPrisma(newBalance).toString() };
    });
  }

  async payments(customerId: string, query: PaginationQueryDto) {
    await this.ensureExists(customerId);
    const where: Prisma.CustomerPaymentWhereInput = { customerId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.customerPayment.findMany({
        where,
        include: { user: { select: { fullName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.customerPayment.count({ where }),
    ]);
    return paginate(data, total, query.page, query.limit);
  }

  /**
   * Accounts-receivable aging: every debtor's outstanding balance split into
   * 0–30 / 31–60 / 61–90 / 90+ day buckets by each unpaid invoice's age, plus
   * the oldest unpaid invoice date. Drives the debtors/overdue view.
   */
  async aging() {
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        name: string;
        phone: string | null;
        balance: string;
        creditLimit: string | null;
        current: string;
        days31to60: string;
        days61to90: string;
        days90plus: string;
        oldestInvoice: Date | null;
      }[]
    >(Prisma.sql`
      SELECT c.id,
             c.name,
             c.phone,
             c.balance::text                                                                AS balance,
             c."creditLimit"::text                                                          AS "creditLimit",
             COALESCE(SUM(CASE WHEN now() - s."createdAt" <= interval '30 days' THEN s."amountDue" ELSE 0 END), 0)::text AS current,
             COALESCE(SUM(CASE WHEN now() - s."createdAt" > interval '30 days' AND now() - s."createdAt" <= interval '60 days' THEN s."amountDue" ELSE 0 END), 0)::text AS "days31to60",
             COALESCE(SUM(CASE WHEN now() - s."createdAt" > interval '60 days' AND now() - s."createdAt" <= interval '90 days' THEN s."amountDue" ELSE 0 END), 0)::text AS "days61to90",
             COALESCE(SUM(CASE WHEN now() - s."createdAt" > interval '90 days' THEN s."amountDue" ELSE 0 END), 0)::text AS "days90plus",
             MIN(s."createdAt")                                                             AS "oldestInvoice"
      FROM customers c
      JOIN sales s
        ON s."customerId" = c.id AND s.status = 'COMPLETED' AND s."amountDue" > 0
      GROUP BY c.id
      ORDER BY c.balance DESC;
    `);
    return rows;
  }

  private async ensureExists(id: string) {
    const exists = await this.prisma.customer.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Customer not found');
  }
}
