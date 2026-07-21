import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginate } from '../../common/dto/pagination.dto';
import { add, money, mul, toPrisma } from '../../common/utils/money';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountingPeriodsService } from '../accounting/accounting-periods.service';
import { AuditService } from '../audit/audit.service';
import { ExpenseCategoriesService } from '../expense-categories/expense-categories.service';
import {
  CreateExpenseDto,
  ExpenseQueryDto,
  UpdateExpenseDto,
} from './dto/expense.dto';
import {
  CreateOfficePurchaseDto,
  OfficePurchaseQueryDto,
} from './dto/office-purchase.dto';

/** Categories are joined on every read so the UI gets the name and icon. */
const CATEGORY_SELECT = {
  select: { id: true, name: true, icon: true, staffAllowed: true, systemKey: true },
} as const;

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly categories: ExpenseCategoriesService,
    private readonly periods: AccountingPeriodsService,
  ) {}

  /**
   * Records an expense. If the user has an OPEN cash session it is linked, so
   * the expense reduces that session's expected cash at close (cash-only model).
   */
  async create(dto: CreateExpenseDto, userId: string, isAdmin: boolean) {
    // Throws if the category is archived, or is management-only and the caller
    // is staff (fixed overheads like salary stay confidential).
    await this.categories.assertUsable(dto.categoryId, isAdmin);
    // Backdating into a month whose books are closed would move its net profit.
    await this.periods.assertOpen(dto.expenseDate, 'an expense dated then');

    const session = await this.prisma.cashSession.findFirst({
      where: { userId, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
      select: { id: true },
    });

    const expense = await this.prisma.expense.create({
      data: {
        categoryId: dto.categoryId,
        amount: toPrisma(dto.amount),
        expenseDate: dto.expenseDate,
        description: dto.description,
        userId,
        cashSessionId: session?.id,
      },
      include: { category: CATEGORY_SELECT },
    });

    await this.audit.record({
      userId,
      action: 'EXPENSE_CREATED',
      entityType: 'Expense',
      entityId: expense.id,
      metadata: {
        category: expense.category.name,
        amount: expense.amount.toString(),
        cashSessionId: session?.id ?? null,
      },
    });

    return expense;
  }

  /**
   * Edits a recorded expense. Staff may only correct their own entries on the
   * day they made them; after that it is an admin job. Nothing tied to a closed
   * cash session may change — that till was already reconciled against it.
   */
  async update(id: string, dto: UpdateExpenseDto, userId: string, isAdmin: boolean) {
    const expense = await this.loadEditable(id, userId, isAdmin, 'edit');

    // Itemized office purchases derive their total from their line items, so
    // the amount and category are owned by that flow, not this one.
    if (expense.items.length > 0 && (dto.amount !== undefined || dto.categoryId)) {
      throw new BadRequestException(
        'This is an itemized office purchase — its amount and category come from its line items. You can still edit its date and description.',
      );
    }

    if (dto.categoryId && dto.categoryId !== expense.categoryId) {
      await this.categories.assertUsable(dto.categoryId, isAdmin);
    }

    // Moving an entry *into* a closed month would change that month's figures.
    if (dto.expenseDate) {
      await this.periods.assertOpen(dto.expenseDate, 'an expense dated then');
    }

    const updated = await this.prisma.expense.update({
      where: { id },
      data: {
        categoryId: dto.categoryId,
        amount: dto.amount === undefined ? undefined : toPrisma(dto.amount),
        expenseDate: dto.expenseDate,
        description: dto.description,
      },
      include: { category: CATEGORY_SELECT, user: { select: { fullName: true } } },
    });

    await this.audit.record({
      userId,
      action: 'EXPENSE_UPDATED',
      entityType: 'Expense',
      entityId: id,
      metadata: {
        before: {
          category: expense.category.name,
          amount: expense.amount.toString(),
          expenseDate: expense.expenseDate,
        },
        after: {
          category: updated.category.name,
          amount: updated.amount.toString(),
          expenseDate: updated.expenseDate,
        },
      },
    });

    return updated;
  }

  /** Deletes a recorded expense, under the same rules as {@link update}. */
  async remove(id: string, userId: string, isAdmin: boolean) {
    const expense = await this.loadEditable(id, userId, isAdmin, 'delete');

    // Line items cascade with the expense.
    await this.prisma.expense.delete({ where: { id } });

    await this.audit.record({
      userId,
      action: 'EXPENSE_DELETED',
      entityType: 'Expense',
      entityId: id,
      metadata: {
        category: expense.category.name,
        amount: expense.amount.toString(),
        expenseDate: expense.expenseDate,
        items: expense.items.length,
      },
    });

    return { message: 'Expense deleted' };
  }

  /**
   * Fetches an expense and enforces who may change it:
   *  - anything linked to a CLOSED cash session is frozen (the close snapshot
   *    already counted it, so changing it would break a reconciled till);
   *  - staff may only touch their own entries, on the day they recorded them.
   */
  private async loadEditable(
    id: string,
    userId: string,
    isAdmin: boolean,
    action: 'edit' | 'delete',
  ) {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: {
        items: { select: { id: true } },
        category: { select: { name: true } },
        cashSession: { select: { status: true } },
      },
    });
    if (!expense) throw new NotFoundException('Expense not found');

    // The month's books are signed off — its figures must not move.
    await this.periods.assertOpen(expense.expenseDate, 'this expense');

    if (expense.cashSession?.status === 'CLOSED') {
      throw new ForbiddenException(
        `This expense belongs to a cash session that has already been closed and cannot be ${
          action === 'edit' ? 'edited' : 'deleted'
        }. Record a correcting entry instead.`,
      );
    }

    if (!isAdmin) {
      if (expense.userId !== userId) {
        throw new ForbiddenException(
          `You can only ${action} expenses you recorded yourself.`,
        );
      }
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      if (expense.createdAt < startOfToday) {
        throw new ForbiddenException(
          `Expenses can only be ${
            action === 'edit' ? 'edited' : 'deleted'
          } on the day they were recorded. Ask an administrator to correct this one.`,
        );
      }
    }

    return expense;
  }

  /**
   * Records an itemized office/internal-use purchase. The goods are consumed
   * in-house (never sellable stock), so it is booked as a single office-supplies
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

    const [categoryId, session] = await Promise.all([
      this.categories.officeCategoryId(),
      this.prisma.cashSession.findFirst({
        where: { userId, status: 'OPEN' },
        orderBy: { openedAt: 'desc' },
        select: { id: true },
      }),
    ]);

    const expense = await this.prisma.expense.create({
      data: {
        categoryId,
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
      include: {
        items: true,
        category: CATEGORY_SELECT,
        user: { select: { fullName: true } },
      },
    });

    await this.audit.record({
      userId,
      action: 'EXPENSE_CREATED',
      entityType: 'Expense',
      entityId: expense.id,
      metadata: {
        category: expense.category.name,
        amount: expense.amount.toString(),
        items: items.length,
        cashSessionId: session?.id ?? null,
      },
    });

    return expense;
  }

  async findOfficePurchases(query: OfficePurchaseQueryDto) {
    const where: Prisma.ExpenseWhereInput = {
      categoryId: await this.categories.officeCategoryId(),
      ...(query.from || query.to
        ? { expenseDate: { gte: query.from, lte: query.to } }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.expense.findMany({
        where,
        include: {
          items: true,
          category: CATEGORY_SELECT,
          user: { select: { fullName: true } },
        },
        orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.expense.count({ where }),
    ]);
    return paginate(data, total, query.page, query.limit);
  }

  async findOneOfficePurchase(id: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, categoryId: await this.categories.officeCategoryId() },
      include: {
        items: true,
        category: CATEGORY_SELECT,
        user: { select: { fullName: true } },
      },
    });
    if (!expense) throw new NotFoundException('Office purchase not found');
    return expense;
  }

  async findAll(query: ExpenseQueryDto, isAdmin: boolean) {
    const where: Prisma.ExpenseWhereInput = {
      ...(query.from || query.to
        ? { expenseDate: { gte: query.from, lte: query.to } }
        : {}),
    };

    if (isAdmin) {
      if (query.categoryId) where.categoryId = query.categoryId;
    } else {
      // Staff only ever see petty cash; a specific filter must be within that set.
      const allowed = await this.categories.staffAllowedIds();
      where.categoryId =
        query.categoryId && allowed.includes(query.categoryId)
          ? query.categoryId
          : { in: allowed };
    }
    const [data, total] = await this.prisma.$transaction([
      this.prisma.expense.findMany({
        where,
        include: {
          category: CATEGORY_SELECT,
          user: { select: { fullName: true } },
          // The UI greys out entries frozen by a closed till.
          cashSession: { select: { status: true } },
        },
        orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.expense.count({ where }),
    ]);
    return paginate(data, total, query.page, query.limit);
  }

  /** Per-day expense totals (count + total) for the daily-totals view.
   *  Staff only ever see their petty-cash categories. */
  async daily(query: { from?: Date; to?: Date }, isAdmin: boolean) {
    const conditions: Prisma.Sql[] = [];
    if (query.from && query.to) {
      conditions.push(Prisma.sql`"expenseDate" BETWEEN ${query.from} AND ${query.to}`);
    } else if (query.from) {
      conditions.push(Prisma.sql`"expenseDate" >= ${query.from}`);
    } else if (query.to) {
      conditions.push(Prisma.sql`"expenseDate" <= ${query.to}`);
    }
    if (!isAdmin) {
      const allowed = await this.categories.staffAllowedIds();
      conditions.push(
        allowed.length
          ? Prisma.sql`"categoryId"::text IN (${Prisma.join(allowed)})`
          : Prisma.sql`FALSE`,
      );
    }
    const where = conditions.length
      ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<
      { period: Date; total: string; count: bigint }[]
    >(Prisma.sql`
      SELECT date_trunc('day', "expenseDate") AS period,
             COALESCE(SUM(amount), 0)::text    AS total,
             COUNT(*)                          AS count
      FROM expenses
      ${where}
      GROUP BY period
      ORDER BY period DESC;
    `);

    return rows.map((r) => ({
      period: r.period,
      total: r.total,
      count: Number(r.count),
    }));
  }
}
