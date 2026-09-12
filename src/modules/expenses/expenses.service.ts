import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { paginate } from '../../common/dto/pagination.dto';
import { resolveOrderBy, SortMap } from '../../common/utils/sort';
import { add, money, mul, sub, toPrisma } from '../../common/utils/money';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountingPeriodsService } from '../accounting/accounting-periods.service';
import { AuditService } from '../audit/audit.service';
import { HandService } from '../banking/hand.service';
import { findOpenSession, requireOpenSession } from '../cash/open-session';
import { ExpenseCategoriesService } from '../expense-categories/expense-categories.service';
import {
  CreateExpenseDto,
  ExpenseQueryDto,
  UpdateExpenseDto,
} from './dto/expense.dto';
import {
  CreateOfficePurchaseDto,
  OfficePurchaseQueryDto,
  PayOfficePurchaseDto,
} from './dto/office-purchase.dto';

/** Categories are joined on every read so the UI gets the name and icon. */
const CATEGORY_SELECT = {
  select: { id: true, name: true, icon: true, staffAllowed: true, systemKey: true },
} as const;

/** Columns the expense list can be ordered by. */
const EXPENSE_SORTS: SortMap<Prisma.ExpenseOrderByWithRelationInput[]> = {
  category: (dir) => [{ category: { name: dir } }],
  description: (dir) => [{ description: dir }],
  expenseDate: (dir) => [{ expenseDate: dir }, { createdAt: dir }],
  user: (dir) => [{ user: { fullName: dir } }],
  amount: (dir) => [{ amount: dir }],
};

/** Columns the office-purchase list can be ordered by. */
const OFFICE_PURCHASE_SORTS: SortMap<Prisma.ExpenseOrderByWithRelationInput[]> = {
  expenseDate: (dir) => [{ expenseDate: dir }, { createdAt: dir }],
  supplierName: (dir) => [{ supplierName: dir }],
  items: (dir) => [{ items: { _count: dir } }],
  user: (dir) => [{ user: { fullName: dir } }],
  amount: (dir) => [{ amount: dir }],
  amountDue: (dir) => [{ amountDue: dir }, { expenseDate: 'desc' }],
};

/** Vendor, lines and what has been paid — everything a credit purchase needs. */
const OFFICE_PURCHASE_INCLUDE = {
  items: true,
  category: CATEGORY_SELECT,
  user: { select: { fullName: true } },
  payments: {
    include: { user: { select: { fullName: true } } },
    orderBy: { createdAt: 'desc' },
  },
} satisfies Prisma.ExpenseInclude;

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly categories: ExpenseCategoriesService,
    private readonly periods: AccountingPeriodsService,
    private readonly hand: HandService,
  ) {}

  /**
   * Records an expense. If the shared till is open the expense is linked to it,
   * so it reduces that session's expected cash at close (cash-only model).
   */
  async create(dto: CreateExpenseDto, userId: string, isAdmin: boolean) {
    // Throws if the category is archived, or is management-only and the caller
    // is staff (fixed overheads like salary stay confidential).
    await this.categories.assertUsable(dto.categoryId, isAdmin);
    // Backdating into a month whose books are closed would move its net profit.
    await this.periods.assertOpen(dto.expenseDate, 'an expense dated then');

    const amount = money(dto.amount);
    const paidFrom = dto.paidFrom ?? 'TILL';
    // Paid from held cash the till is not involved at all, so it need not be
    // open and no count has to explain the money.
    const session = paidFrom === 'TILL' ? await findOpenSession(this.prisma) : null;

    // One transaction: the cost and the cash that settled it cannot exist
    // without each other, and held cash cannot be overdrawn by two people at
    // once.
    const expense = await this.prisma.runSerializable(async (tx) => {
      const row = await tx.expense.create({
        data: {
          categoryId: dto.categoryId,
          amount: toPrisma(amount),
          expenseDate: dto.expenseDate,
          description: dto.description,
          userId,
          cashSessionId: session?.id,
          // An ordinary expense is money already handed over as it is recorded;
          // only office purchases can be taken on credit.
          paymentMethod: 'CASH',
          amountPaid: toPrisma(amount),
          amountDue: toPrisma(money(0)),
          paidFrom,
        },
        include: { category: CATEGORY_SELECT },
      });

      if (paidFrom === 'HELD_CASH') {
        await this.hand.spendTx(tx, {
          amount,
          userId,
          notes: `${row.category.name}${dto.description ? `: ${dto.description}` : ''}`,
          expenseId: row.id,
        });
      }

      await this.audit.recordTx(tx, {
        userId,
        action: 'EXPENSE_CREATED',
        entityType: 'Expense',
        entityId: row.id,
        metadata: {
          category: row.category.name,
          amount: row.amount.toString(),
          paidFrom,
          cashSessionId: session?.id ?? null,
        },
      });

      return row;
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
        amountDue: expense.amountDue.toString(),
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
        payments: { select: { id: true } },
        category: { select: { name: true } },
        cashSession: { select: { status: true } },
      },
    });
    if (!expense) throw new NotFoundException('Expense not found');

    // Money has already been handed to the vendor against this purchase, out of
    // a till that reconciled around it. Deleting the row would take those
    // payments with it and leave that drawer short of an explanation.
    if (expense.payments.length > 0) {
      throw new ForbiddenException(
        `This purchase has ${expense.payments.length} payment(s) recorded against it, so it cannot be ${
          action === 'edit' ? 'edited' : 'deleted'
        }. Record a correcting entry instead.`,
      );
    }

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
   * expense — its total counts against profit on its date either way.
   *
   * How it is settled decides only what happens to the cash. CASH is paid out
   * of the open till there and then. CREDIT charges the till nothing: the total
   * (less any part-payment handed over now) stays owed to the vendor and is paid
   * down through {@link payOfficePurchase}, each payment charging the till of
   * the day the money actually changed hands.
   */
  async createOfficePurchase(dto: CreateOfficePurchaseDto, userId: string) {
    const items = dto.items.map((i) => ({
      name: i.name.trim(),
      quantity: i.quantity,
      unitCost: i.unitCost,
      lineTotal: mul(i.unitCost, i.quantity),
    }));
    const total = items.reduce((a, i) => add(a, i.lineTotal), money(0));

    const paymentMethod = dto.paymentMethod ?? 'CASH';
    const supplierName = dto.supplierName?.trim() || null;
    // A debt nobody is named for cannot be paid: on credit the vendor is the
    // only record of whom the shop owes.
    if (paymentMethod === 'CREDIT' && !supplierName) {
      throw new BadRequestException(
        'Name the supplier or vendor — a purchase on credit has to say who is owed.',
      );
    }

    let amountPaid: Decimal;
    if (paymentMethod === 'CASH') {
      amountPaid = total;
    } else {
      amountPaid = money(dto.amountPaid ?? 0);
      if (amountPaid.greaterThan(total)) {
        throw new BadRequestException(
          `Amount paid (${amountPaid.toFixed(2)}) cannot exceed the total (${total.toFixed(2)}).`,
        );
      }
    }
    const amountDue = sub(total, amountPaid);

    // Nothing paid now means no pot was touched, so there is no source to
    // record; otherwise the money came from the drawer or from held cash.
    const paidFrom = amountPaid.greaterThan(0) ? (dto.paidFrom ?? 'TILL') : null;

    const [categoryId, session] = await Promise.all([
      this.categories.officeCategoryId(),
      paidFrom === 'TILL' ? findOpenSession(this.prisma) : Promise.resolve(null),
    ]);

    // Only cash that actually left the drawer belongs to a till. A purchase
    // taken wholly on credit is linked to none, so no close has to account for
    // it and no closed session freezes a record nobody has paid yet — and the
    // same is true of one paid from held cash, which never saw a drawer.
    const tillId = paidFrom === 'TILL' ? session?.id : undefined;

    const expense = await this.prisma.runSerializable(async (tx) => {
      const row = await tx.expense.create({
        data: {
          categoryId,
          amount: toPrisma(total),
          expenseDate: dto.purchaseDate,
          description: dto.description,
          supplierName,
          userId,
          cashSessionId: tillId,
          paymentMethod,
          amountPaid: toPrisma(amountPaid),
          amountDue: toPrisma(amountDue),
          paidFrom,
          items: {
            create: items.map((i) => ({
              name: i.name,
              quantity: i.quantity,
              unitCost: toPrisma(i.unitCost),
              lineTotal: toPrisma(i.lineTotal),
            })),
          },
        },
        include: OFFICE_PURCHASE_INCLUDE,
      });

      if (paidFrom === 'HELD_CASH') {
        await this.hand.spendTx(tx, {
          amount: amountPaid,
          userId,
          notes: `Office purchase${supplierName ? ` — ${supplierName}` : ''}`,
          expenseId: row.id,
        });
      }

      await this.audit.recordTx(tx, {
        userId,
        action: 'EXPENSE_CREATED',
        entityType: 'Expense',
        entityId: row.id,
        metadata: {
          category: row.category.name,
          amount: row.amount.toString(),
          paymentMethod,
          amountPaid: toPrisma(amountPaid).toString(),
          amountDue: toPrisma(amountDue).toString(),
          paidFrom,
          supplierName,
          items: items.length,
          cashSessionId: tillId ?? null,
        },
      });

      return row;
    });

    return expense;
  }

  /**
   * Pays down an office purchase bought on credit, out of the open till.
   *
   * The cost was already booked on the purchase date, so this moves no profit —
   * it only takes the cash out on the day it is handed over, which is why an
   * open session is required and the payment carries its id.
   */
  async payOfficePurchase(
    id: string,
    dto: PayOfficePurchaseDto,
    userId: string,
    idempotencyKey?: string,
  ) {
    // Idempotency: a retried request returns the payment it already recorded.
    if (idempotencyKey) {
      const existing = await this.prisma.expensePayment.findUnique({
        where: { idempotencyKey },
        include: { expense: { select: { amountPaid: true, amountDue: true } } },
      });
      if (existing) return this.paymentResult(existing, existing.expense);
    }

    const officeCategoryId = await this.categories.officeCategoryId();

    return this.prisma.runSerializable(async (tx) => {
      if (idempotencyKey) {
        const dup = await tx.expensePayment.findUnique({
          where: { idempotencyKey },
          include: { expense: { select: { amountPaid: true, amountDue: true } } },
        });
        if (dup) return this.paymentResult(dup, dup.expense);
      }

      const expense = await tx.expense.findFirst({
        where: { id, categoryId: officeCategoryId },
        select: { id: true, amountPaid: true, amountDue: true, supplierName: true },
      });
      if (!expense) throw new NotFoundException('Office purchase not found');

      const owed = money(expense.amountDue);
      if (owed.lessThanOrEqualTo(0)) {
        throw new BadRequestException('This purchase is already paid in full.');
      }

      const amount = money(dto.amount);
      if (amount.greaterThan(owed)) {
        throw new BadRequestException(
          `Payment (${amount.toFixed(2)}) is more than the ${owed.toFixed(2)} still owed.`,
        );
      }

      // From held cash no till is involved, so none has to be open.
      const paidFrom = dto.paidFrom ?? 'TILL';
      const session =
        paidFrom === 'TILL'
          ? await requireOpenSession(tx, 'paying an office purchase')
          : null;

      const payment = await tx.expensePayment.create({
        data: {
          expenseId: expense.id,
          userId,
          cashSessionId: session?.id,
          paidFrom,
          amount: toPrisma(amount),
          notes: dto.notes,
          idempotencyKey,
        },
        include: { user: { select: { fullName: true } } },
      });

      if (paidFrom === 'HELD_CASH') {
        await this.hand.spendTx(tx, {
          amount,
          userId,
          notes: `Office purchase payment${
            expense.supplierName ? ` — ${expense.supplierName}` : ''
          }`,
          expensePaymentId: payment.id,
        });
      }

      // Moving both halves in one statement is what keeps
      // amountPaid + amountDue == amount true.
      const updated = await tx.expense.update({
        where: { id: expense.id },
        data: {
          amountPaid: toPrisma(add(money(expense.amountPaid), amount)),
          amountDue: toPrisma(sub(owed, amount)),
        },
        select: { amountPaid: true, amountDue: true },
      });

      await this.audit.recordTx(tx, {
        userId,
        action: 'EXPENSE_PAYMENT',
        entityType: 'Expense',
        entityId: expense.id,
        metadata: {
          amount: toPrisma(amount).toString(),
          amountDue: updated.amountDue.toString(),
          supplierName: expense.supplierName,
          paidFrom,
          cashSessionId: session?.id ?? null,
        },
      });

      return this.paymentResult(payment, updated);
    });
  }

  /**
   * What the shop still owes on office purchases — the payable side of the
   * ledger, the mirror of a customer's outstanding balance.
   */
  async officePurchasesOutstanding() {
    const where: Prisma.ExpenseWhereInput = {
      categoryId: await this.categories.officeCategoryId(),
      amountDue: { gt: 0 },
    };
    const [agg, oldest] = await Promise.all([
      this.prisma.expense.aggregate({
        where,
        _sum: { amountDue: true },
        _count: true,
      }),
      this.prisma.expense.findFirst({
        where,
        orderBy: { expenseDate: 'asc' },
        select: { expenseDate: true, supplierName: true },
      }),
    ]);
    return {
      total: money(agg._sum.amountDue ?? 0).toFixed(2),
      count: agg._count,
      oldest: oldest?.expenseDate ?? null,
      oldestSupplier: oldest?.supplierName ?? null,
    };
  }

  /** Payment plus the balance it left behind, the shape every caller wants. */
  private paymentResult<T>(
    payment: T,
    expense: { amountPaid: Prisma.Decimal; amountDue: Prisma.Decimal },
  ) {
    return {
      payment,
      amountPaid: expense.amountPaid.toString(),
      amountDue: expense.amountDue.toString(),
    };
  }

  async findOfficePurchases(query: OfficePurchaseQueryDto) {
    const where: Prisma.ExpenseWhereInput = {
      categoryId: await this.categories.officeCategoryId(),
      ...(query.from || query.to
        ? { expenseDate: { gte: query.from, lte: query.to } }
        : {}),
      // "Unpaid" is the working list: what still has to be settled with a vendor.
      ...(query.settlement === 'UNPAID'
        ? { amountDue: { gt: 0 } }
        : query.settlement === 'PAID'
          ? { amountDue: { lte: 0 } }
          : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.expense.findMany({
        where,
        include: OFFICE_PURCHASE_INCLUDE,
        orderBy: resolveOrderBy(query, OFFICE_PURCHASE_SORTS, [
          { expenseDate: 'desc' },
          { createdAt: 'desc' },
        ]),
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
      include: OFFICE_PURCHASE_INCLUDE,
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
        orderBy: resolveOrderBy(query, EXPENSE_SORTS, [
          { expenseDate: 'desc' },
          { createdAt: 'desc' },
        ]),
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
