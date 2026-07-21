import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateExpenseCategoryDto,
  UpdateExpenseCategoryDto,
} from './dto/expense-category.dto';

/** Categories the code itself resolves; they may be renamed but never removed. */
export const OFFICE_SUPPLIES_KEY = 'OFFICE_SUPPLIES';
const PROTECTED_KEYS = [OFFICE_SUPPLIES_KEY];

@Injectable()
export class ExpenseCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Admins see every category (archived ones included, with usage counts) so
   * they can manage the list. Staff only ever see the active petty-cash ones
   * they are allowed to record against.
   */
  findAll(isAdmin: boolean) {
    return this.prisma.expenseCategory.findMany({
      where: isAdmin ? {} : { isActive: true, staffAllowed: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { expenses: true } } },
    });
  }

  async findOne(id: string) {
    const category = await this.prisma.expenseCategory.findUnique({
      where: { id },
      include: { _count: { select: { expenses: true } } },
    });
    if (!category) throw new NotFoundException('Expense category not found');
    return category;
  }

  async create(dto: CreateExpenseCategoryDto, userId: string) {
    const name = dto.name.trim();
    await this.assertNameFree(name);

    const category = await this.prisma.expenseCategory.create({
      data: {
        name,
        icon: dto.icon?.trim() || undefined,
        staffAllowed: dto.staffAllowed ?? false,
        sortOrder: dto.sortOrder,
      },
    });

    await this.audit.record({
      userId,
      action: 'EXPENSE_CATEGORY_CREATED',
      entityType: 'ExpenseCategory',
      entityId: category.id,
      metadata: { name: category.name, staffAllowed: category.staffAllowed },
    });

    return category;
  }

  async update(id: string, dto: UpdateExpenseCategoryDto, userId: string) {
    const existing = await this.findOne(id);
    const name = dto.name?.trim();
    if (name && name.toLowerCase() !== existing.name.toLowerCase()) {
      await this.assertNameFree(name);
    }

    // Office purchases are booked against this category by code — archiving it
    // would leave that feature with nowhere to post.
    if (
      dto.isActive === false &&
      existing.systemKey &&
      PROTECTED_KEYS.includes(existing.systemKey)
    ) {
      throw new BadRequestException(
        `"${existing.name}" is used by office purchases and cannot be archived. You can rename it or change its icon instead.`,
      );
    }

    const category = await this.prisma.expenseCategory.update({
      where: { id },
      data: {
        name,
        icon: dto.icon?.trim() || undefined,
        staffAllowed: dto.staffAllowed,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });

    await this.audit.record({
      userId,
      action: 'EXPENSE_CATEGORY_UPDATED',
      entityType: 'ExpenseCategory',
      entityId: category.id,
      metadata: { name: category.name, isActive: category.isActive },
    });

    return category;
  }

  /**
   * Deletion is only for categories that were never used. Anything with
   * expenses booked against it must be archived instead, so historical totals
   * and per-category reports stay intact.
   */
  async remove(id: string, userId: string) {
    const existing = await this.findOne(id);

    if (existing.systemKey && PROTECTED_KEYS.includes(existing.systemKey)) {
      throw new BadRequestException(
        `"${existing.name}" is used by office purchases and cannot be deleted.`,
      );
    }

    if (existing._count.expenses > 0) {
      throw new BadRequestException(
        `"${existing.name}" has ${existing._count.expenses} expense${
          existing._count.expenses === 1 ? '' : 's'
        } booked against it and cannot be deleted. Archive it instead to hide it from new entries while keeping its history.`,
      );
    }

    await this.prisma.expenseCategory.delete({ where: { id } });

    await this.audit.record({
      userId,
      action: 'EXPENSE_CATEGORY_DELETED',
      entityType: 'ExpenseCategory',
      entityId: id,
      metadata: { name: existing.name },
    });

    return { message: 'Expense category deleted' };
  }

  // ---- Helpers used by the expenses module ---------------------------------

  /** The category office/internal-use purchases are booked against. */
  async officeCategoryId() {
    const category = await this.prisma.expenseCategory.findUnique({
      where: { systemKey: OFFICE_SUPPLIES_KEY },
      select: { id: true },
    });
    if (!category) {
      throw new NotFoundException(
        'The office purchases category is missing. Re-run the database seed to restore it.',
      );
    }
    return category.id;
  }

  /** Ids of the categories staff may record against and see ("petty cash"). */
  async staffAllowedIds() {
    const rows = await this.prisma.expenseCategory.findMany({
      where: { staffAllowed: true },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /**
   * Validates a category chosen when recording an expense: it must exist, be
   * active, and — for staff — be one of the petty-cash categories.
   */
  async assertUsable(categoryId: string, isAdmin: boolean) {
    const category = await this.prisma.expenseCategory.findUnique({
      where: { id: categoryId },
      select: { id: true, name: true, isActive: true, staffAllowed: true },
    });
    if (!category) throw new NotFoundException('Expense category not found');
    if (!category.isActive) {
      throw new BadRequestException(
        `"${category.name}" is archived and can no longer be used for new entries.`,
      );
    }
    if (!isAdmin && !category.staffAllowed) {
      throw new ForbiddenException(
        `You may only record petty-cash expenses. "${category.name}" is management-only.`,
      );
    }
    return category;
  }

  private async assertNameFree(name: string) {
    const clash = await this.prisma.expenseCategory.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (clash) throw new ConflictException(`A category named "${name}" already exists.`);
  }
}
