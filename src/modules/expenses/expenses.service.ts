import { ForbiddenException, Injectable } from '@nestjs/common';
import { ExpenseCategory, Prisma } from '@prisma/client';
import { paginate } from '../../common/dto/pagination.dto';
import { add, money, mul, toPrisma } from '../../common/utils/money';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateExpenseDto, ExpenseQueryDto } from './dto/expense.dto';
import {
  CreateOfficePurchaseDto,
  OfficePurchaseQueryDto,
} from './dto/office-purchase.dto';

// Categories staff may record/see ("petty cash"). Fixed overheads (rent, salary,
// electricity, internet) are management-only. Keep in sync with the frontend.
const PETTY_CASH_CATEGORIES: ExpenseCategory[] = [
  ExpenseCategory.TONER,
  ExpenseCategory.PAPER,
  ExpenseCategory.TRANSPORT,
  ExpenseCategory.FOOD,
  ExpenseCategory.MISCELLANEOUS,
];

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Records an expense. If the user has an OPEN cash session it is linked, so
   * the expense reduces that session's expected cash at close (cash-only model).
   */
  async create(dto: CreateExpenseDto, userId: string, isAdmin: boolean) {
    // Staff are limited to petty cash; overheads like salary stay confidential.
    if (!isAdmin && !PETTY_CASH_CATEGORIES.includes(dto.category)) {
      throw new ForbiddenException(
        'Staff may only record petty-cash expenses (toner, paper, transport, miscellaneous).',
      );
    }

    const session = await this.prisma.cashSession.findFirst({
      where: { userId, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
      select: { id: true },
    });

    const expense = await this.prisma.expense.create({
      data: {
        category: dto.category,
        amount: toPrisma(dto.amount),
        expenseDate: dto.expenseDate,
        description: dto.description,
        userId,
        cashSessionId: session?.id,
      },
    });

    await this.audit.record({
      userId,
      action: 'EXPENSE_CREATED',
      entityType: 'Expense',
      entityId: expense.id,
      metadata: {
        category: expense.category,
        amount: expense.amount.toString(),
        cashSessionId: session?.id ?? null,
      },
    });

    return expense;
  }

  /**
   * Records an itemized office/internal-use purchase. The goods are consumed
   * in-house (never sellable stock), so it is booked as a single OFFICE_SUPPLIES
   * expense — its total flows into the till close and P&L like any expense. Any
   * open cash session is linked so the spend reduces expected cash at close.
   */
  async createOfficePurchase(dto: CreateOfficePurchaseDto, userId: string) {
    const items = dto.items.map((i) => ({
      name: i.name.trim(),
      quantity: i.quantity,
      unitCost: i.unitCost,
      lineTotal: mul(i.unitCost, i.quantity),
    }));
    const total = items.reduce((a, i) => add(a, i.lineTotal), money(0));

    const session = await this.prisma.cashSession.findFirst({
      where: { userId, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
      select: { id: true },
    });

    const expense = await this.prisma.expense.create({
      data: {
        category: ExpenseCategory.OFFICE_SUPPLIES,
        amount: toPrisma(total),
        expenseDate: dto.purchaseDate,
        description: dto.description,
        supplierName: dto.supplierName?.trim() || null,
        userId,
        cashSessionId: session?.id,
        items: {
          create: items.map((i) => ({
            name: i.name,
            quantity: i.quantity,
            unitCost: toPrisma(i.unitCost),
            lineTotal: toPrisma(i.lineTotal),
          })),
        },
      },
      include: { items: true, user: { select: { fullName: true } } },
    });

    await this.audit.record({
      userId,
      action: 'EXPENSE_CREATED',
      entityType: 'Expense',
      entityId: expense.id,
      metadata: {
        category: expense.category,
        amount: expense.amount.toString(),
        items: items.length,
        cashSessionId: session?.id ?? null,
      },
    });

    return expense;
  }

  async findOfficePurchases(query: OfficePurchaseQueryDto) {
    const where: Prisma.ExpenseWhereInput = {
      category: ExpenseCategory.OFFICE_SUPPLIES,
      ...(query.from || query.to
        ? { expenseDate: { gte: query.from, lte: query.to } }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.expense.findMany({
        where,
        include: { items: true, user: { select: { fullName: true } } },
        orderBy: { expenseDate: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.expense.count({ where }),
    ]);
    return paginate(data, total, query.page, query.limit);
  }

  async findAll(query: ExpenseQueryDto, isAdmin: boolean) {
    const where: Prisma.ExpenseWhereInput = {
      ...(query.from || query.to
        ? { expenseDate: { gte: query.from, lte: query.to } }
        : {}),
    };

    if (isAdmin) {
      if (query.category) where.category = query.category;
    } else {
      // Staff only ever see petty cash; a specific filter must be within that set.
      where.category =
        query.category && PETTY_CASH_CATEGORIES.includes(query.category)
          ? query.category
          : { in: PETTY_CASH_CATEGORIES };
    }
    const [data, total] = await this.prisma.$transaction([
      this.prisma.expense.findMany({
        where,
        include: { user: { select: { fullName: true } } },
        orderBy: { expenseDate: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.expense.count({ where }),
    ]);
    return paginate(data, total, query.page, query.limit);
  }
}
