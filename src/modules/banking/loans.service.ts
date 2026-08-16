import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { paginate } from '../../common/dto/pagination.dto';
import { add, money, sub, toPrisma } from '../../common/utils/money';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { assertTillCovers } from '../cash/expected-cash';
import { requireOpenSession } from '../cash/open-session';
import { BankService } from './bank.service';
import { IssueLoanDto, LoanQueryDto, RepayLoanDto } from './dto/banking.dto';

const LOAN_INCLUDE = {
  user: { select: { id: true, fullName: true, email: true, role: true } },
  issuedBy: { select: { id: true, fullName: true } },
  repayments: { orderBy: { paidAt: 'desc' } },
} satisfies Prisma.LoanInclude;

/**
 * Money a shop member has taken for themselves.
 *
 * This is a debt owed TO the shop, so issuing one must never touch profit: the
 * business swapped cash for a claim on a person, and it is no poorer for it.
 * Nothing here writes an Expense, and the P&L never sees these rows — the same
 * discipline that keeps a bank deposit from being mistaken for spending.
 *
 * The cash side rides on the existing till ledger. Taking money from the drawer
 * writes a CashMovement, which the close-of-day reconciliation already accounts
 * for, so a loan cannot quietly turn into a shortage at the count.
 */
@Injectable()
export class LoansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bank: BankService,
    private readonly audit: AuditService,
  ) {}

  async issue(dto: IssueLoanDto, issuedById: string) {
    const amount = money(dto.amount);

    const borrower = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true, fullName: true, isActive: true },
    });
    if (!borrower) throw new NotFoundException('Shop member not found');
    if (!borrower.isActive) {
      throw new BadRequestException(
        `${borrower.fullName} is no longer active — reactivate the account before lending to them.`,
      );
    }

    return this.prisma.runSerializable(async (tx) => {
      // Taking cash from the drawer needs a till open to take it from; the bank
      // needs enough in it. Either way the money must exist before it moves.
      let cashSessionId: string | null = null;
      if (dto.source === 'HAND') {
        const session = await requireOpenSession(tx, 'lending cash from the till');
        await assertTillCovers(tx, session.id, amount, 'lending more than it holds');
        cashSessionId = session.id;
      } else {
        await this.bank.assertCovers(tx, amount.negated());
      }

      const loan = await tx.loan.create({
        data: {
          userId: dto.userId,
          amount: toPrisma(amount),
          source: dto.source,
          dueDate: dto.dueDate,
          notes: dto.notes,
          issuedById,
          cashSessionId,
        },
        include: LOAN_INCLUDE,
      });

      if (dto.source === 'HAND') {
        await tx.cashMovement.create({
          data: {
            cashSessionId: cashSessionId!,
            type: 'WITHDRAWAL',
            amount: toPrisma(amount),
            userId: issuedById,
            notes: `Loan to ${borrower.fullName}`,
          },
        });
      } else {
        await this.bank.writeTx(tx, {
          type: 'LOAN_OUT',
          amount: amount.negated(),
          userId: issuedById,
          loanId: loan.id,
          notes: `Loan to ${borrower.fullName}`,
          action: 'BANK_LOAN_OUT',
        });
      }

      await this.audit.recordTx(tx, {
        userId: issuedById,
        action: 'LOAN_ISSUED',
        entityType: 'Loan',
        entityId: loan.id,
        metadata: {
          borrower: borrower.fullName,
          borrowerId: borrower.id,
          amount: amount.toFixed(2),
          source: dto.source,
          dueDate: dto.dueDate.toISOString(),
          notes: dto.notes ?? null,
        },
      });

      return this.shape(loan);
    });
  }

  async repay(loanId: string, dto: RepayLoanDto, recordedById: string) {
    const amount = money(dto.amount);

    return this.prisma.runSerializable(async (tx) => {
      const loan = await tx.loan.findUnique({
        where: { id: loanId },
        include: LOAN_INCLUDE,
      });
      if (!loan) throw new NotFoundException('Loan not found');

      const outstanding = this.outstanding(loan);
      if (outstanding.lte(0)) {
        throw new BadRequestException('This loan is already fully repaid.');
      }
      if (amount.greaterThan(outstanding)) {
        throw new BadRequestException(
          `${loan.user.fullName} owes ${outstanding.toFixed(2)}; ${amount.toFixed(2)} is more than that.`,
        );
      }

      let cashSessionId: string | null = null;
      if (dto.destination === 'HAND') {
        const session = await requireOpenSession(tx, 'taking a repayment into the till');
        cashSessionId = session.id;
      }

      const repayment = await tx.loanRepayment.create({
        data: {
          loanId,
          amount: toPrisma(amount),
          destination: dto.destination,
          notes: dto.notes,
          recordedById,
          cashSessionId,
        },
      });

      if (dto.destination === 'HAND') {
        await tx.cashMovement.create({
          data: {
            cashSessionId: cashSessionId!,
            type: 'DEPOSIT',
            amount: toPrisma(amount),
            userId: recordedById,
            notes: `Loan repayment from ${loan.user.fullName}`,
          },
        });
      } else {
        await this.bank.writeTx(tx, {
          type: 'LOAN_REPAYMENT',
          amount,
          userId: recordedById,
          loanId,
          repaymentId: repayment.id,
          notes: `Repayment from ${loan.user.fullName}`,
          action: 'BANK_LOAN_REPAYMENT',
        });
      }

      const settled = sub(outstanding, amount).lte(0);
      const updated = await tx.loan.update({
        where: { id: loanId },
        data: { status: settled ? 'REPAID' : 'OUTSTANDING' },
        include: LOAN_INCLUDE,
      });

      await this.audit.recordTx(tx, {
        userId: recordedById,
        action: 'LOAN_REPAID',
        entityType: 'Loan',
        entityId: loanId,
        metadata: {
          borrower: loan.user.fullName,
          amount: amount.toFixed(2),
          destination: dto.destination,
          outstandingAfter: sub(outstanding, amount).toFixed(2),
          settled,
        },
      });

      return this.shape(updated);
    });
  }

  /**
   * Admins see every loan. A staff member sees only their own — they need to
   * know what they owe without the rest of the shop's borrowing being on show.
   */
  async findAll(query: LoanQueryDto, viewer: { id: string; role: string }) {
    const isAdmin = viewer.role === 'ADMIN';
    const where: Prisma.LoanWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(isAdmin ? (query.userId ? { userId: query.userId } : {}) : { userId: viewer.id }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.loan.findMany({
        where,
        include: LOAN_INCLUDE,
        orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.loan.count({ where }),
    ]);
    return paginate(data.map((l) => this.shape(l)), total, query.page, query.limit);
  }

  async findOne(id: string, viewer: { id: string; role: string }) {
    const loan = await this.prisma.loan.findUnique({
      where: { id },
      include: LOAN_INCLUDE,
    });
    if (!loan) throw new NotFoundException('Loan not found');
    if (viewer.role !== 'ADMIN' && loan.userId !== viewer.id) {
      throw new ForbiddenException('You can only view your own loans.');
    }
    return this.shape(loan);
  }

  /** Who owes what, and how much of it is late. */
  async summary() {
    const loans = await this.prisma.loan.findMany({
      where: { status: 'OUTSTANDING' },
      include: LOAN_INCLUDE,
    });
    const today = new Date();

    let total = money(0);
    let overdue = money(0);
    const byMember = new Map<string, { name: string; amount: Decimal; overdue: Decimal }>();

    for (const loan of loans) {
      const left = this.outstanding(loan);
      if (left.lte(0)) continue;
      const isLate = loan.dueDate < today;
      total = add(total, left);
      if (isLate) overdue = add(overdue, left);

      const entry = byMember.get(loan.userId) ?? {
        name: loan.user.fullName,
        amount: money(0),
        overdue: money(0),
      };
      entry.amount = add(entry.amount, left);
      if (isLate) entry.overdue = add(entry.overdue, left);
      byMember.set(loan.userId, entry);
    }

    return {
      outstanding: total.toFixed(2),
      overdue: overdue.toFixed(2),
      loanCount: loans.length,
      byMember: [...byMember.entries()]
        .map(([userId, v]) => ({
          userId,
          fullName: v.name,
          outstanding: v.amount.toFixed(2),
          overdue: v.overdue.toFixed(2),
        }))
        .sort((a, b) => Number(b.outstanding) - Number(a.outstanding)),
    };
  }

  private outstanding(loan: { amount: Prisma.Decimal; repayments: { amount: Prisma.Decimal }[] }) {
    const paid = loan.repayments.reduce<Decimal>((a, r) => add(a, r.amount), money(0));
    return sub(money(loan.amount), paid);
  }

  private shape<T extends { amount: Prisma.Decimal; dueDate: Date; status: string; repayments: { amount: Prisma.Decimal }[] }>(
    loan: T,
  ) {
    const left = this.outstanding(loan);
    return {
      ...loan,
      outstanding: left.toFixed(2),
      isOverdue: loan.status === 'OUTSTANDING' && left.gt(0) && loan.dueDate < new Date(),
    };
  }
}
