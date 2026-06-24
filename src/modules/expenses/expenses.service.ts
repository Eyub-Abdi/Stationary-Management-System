import { ForbiddenException, Injectable } from '@nestjs/common';
import { ExpenseCategory, Prisma } from '@prisma/client';
import { paginate } from '../../common/dto/pagination.dto';
import { toPrisma } from '../../common/utils/money';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateExpenseDto, ExpenseQueryDto } from './dto/expense.dto';

// Categories staff may record/see ("petty cash"). Fixed overheads (rent, salary,
// electricity, internet) are management-only. Keep in sync with the frontend.
const PETTY_CASH_CATEGORIES: ExpenseCategory[] = [
  ExpenseCategory.TONER,
  ExpenseCategory.PAPER,
  ExpenseCategory.TRANSPORT,
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
