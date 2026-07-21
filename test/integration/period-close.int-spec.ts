import { execSync } from 'child_process';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { AccountingPeriodsService } from '../../src/modules/accounting/accounting-periods.service';
import { ExpenseCategoriesService } from '../../src/modules/expense-categories/expense-categories.service';
import { ExpensesService } from '../../src/modules/expenses/expenses.service';

/**
 * Month-end close against a REAL Postgres. Verifies that closing snapshots the
 * right figures, that the snapshot stops tracking live entries, and — the point
 * of the whole feature — that entries behind a closed month are actually frozen.
 *
 * Gated on TEST_DATABASE_URL (the database is migrated and truncated here):
 *   TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/kj_test npm run test:int
 */
const TEST_DB = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DB ? describe : describe.skip;

// A month that has definitely ended, so it is eligible to close.
const CLOSED_YEAR = 2026;
const CLOSED_MONTH = 3; // March 2026

describeDb('Month-end close (integration)', () => {
  let prisma: PrismaService;
  let periods: AccountingPeriodsService;
  let expenses: ExpensesService;

  let userId: string;
  let categoryId: string;
  let marchExpenseId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    execSync('npx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: TEST_DB },
      stdio: 'ignore',
    });

    prisma = new PrismaService();
    await prisma.$connect();

    const audit = new AuditService(prisma);
    periods = new AccountingPeriodsService(prisma, audit);
    const categories = new ExpenseCategoriesService(prisma, audit);
    expenses = new ExpensesService(prisma, audit, categories, periods);

    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        accounting_periods, cogs_allocations, sale_return_items, sale_returns,
        sale_items, sales, purchase_items, inventory_batches,
        inventory_movements, purchases, cash_movements, expense_items, expenses,
        cash_sessions, customers, suppliers, products, document_sequences,
        audit_logs, users
      RESTART IDENTITY CASCADE;
    `);

    const user = await prisma.user.create({
      data: {
        email: `close_${Date.now()}@test.local`,
        passwordHash: 'x',
        fullName: 'Close Tester',
        role: 'ADMIN',
      },
    });
    userId = user.id;

    // The seeded categories survive the truncate (expense_categories is not in
    // the list) — use the miscellaneous one.
    const category = await prisma.expenseCategory.findUniqueOrThrow({
      where: { systemKey: 'MISCELLANEOUS' },
    });
    categoryId = category.id;

    // March 2026: one sale of 50,000 (COGS 20,000) and one expense of 8,000.
    await prisma.sale.create({
      data: {
        invoiceNumber: 'INV-MAR-1',
        transactionNumber: 'TXN-MAR-1',
        userId,
        subtotal: '50000',
        total: '50000',
        cashReceived: '50000',
        amountPaid: '50000',
        totalCogs: '20000',
        createdAt: new Date(CLOSED_YEAR, CLOSED_MONTH - 1, 15),
      },
    });
    const marchExpense = await prisma.expense.create({
      data: {
        categoryId,
        amount: '8000',
        expenseDate: new Date(CLOSED_YEAR, CLOSED_MONTH - 1, 20),
        userId,
      },
    });
    marchExpenseId = marchExpense.id;

    // April 2026: a later month, so "close in order" has something to complain
    // about and the lock can be shown to be month-scoped.
    await prisma.expense.create({
      data: {
        categoryId,
        amount: '3000',
        expenseDate: new Date(CLOSED_YEAR, CLOSED_MONTH, 10),
        userId,
      },
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('computes the month from its real entries', async () => {
    const f = await periods.computeFigures(CLOSED_YEAR, CLOSED_MONTH);
    expect(f.revenue.toFixed(2)).toBe('50000.00');
    expect(f.cogs.toFixed(2)).toBe('20000.00');
    expect(f.grossProfit.toFixed(2)).toBe('30000.00');
    expect(f.expenses.toFixed(2)).toBe('8000.00');
    expect(f.netProfit.toFixed(2)).toBe('22000.00'); // 30000 − 8000
    expect(f.saleCount).toBe(1);
  });

  it('refuses to close April while March is still open', async () => {
    await expect(
      periods.close({ year: CLOSED_YEAR, month: CLOSED_MONTH + 1 }, userId),
    ).rejects.toThrow(/Close March 2026 first/i);
  });

  it('closes March and snapshots its figures', async () => {
    const period = await periods.close(
      { year: CLOSED_YEAR, month: CLOSED_MONTH, notes: 'checked' },
      userId,
    );
    expect(period.status).toBe('CLOSED');
    expect(period.netProfit.toString()).toBe('22000');
    expect(period.notes).toBe('checked');
  });

  it('freezes the expenses behind the closed month', async () => {
    await expect(
      expenses.update(marchExpenseId, { amount: 999 }, userId, true),
    ).rejects.toThrow(/March 2026 has been closed/i);

    await expect(expenses.remove(marchExpenseId, userId, true)).rejects.toThrow(
      /March 2026 has been closed/i,
    );

    // Backdating a new entry into the closed month is refused too.
    await expect(
      expenses.create(
        {
          categoryId,
          amount: 500,
          expenseDate: new Date(CLOSED_YEAR, CLOSED_MONTH - 1, 25),
        },
        userId,
        true,
      ),
    ).rejects.toThrow(/March 2026 has been closed/i);
  });

  it('leaves other months editable', async () => {
    const april = await expenses.create(
      {
        categoryId,
        amount: 1500,
        expenseDate: new Date(CLOSED_YEAR, CLOSED_MONTH, 12),
      },
      userId,
      true,
    );
    expect(april.amount.toString()).toBe('1500');
  });

  it('reports the snapshot, not live figures, while closed', async () => {
    // Something recorded in March would change its figures — but the month is
    // closed, so the statement must keep reporting what was signed off.
    await prisma.expense.create({
      data: {
        categoryId,
        amount: '5000',
        expenseDate: new Date(CLOSED_YEAR, CLOSED_MONTH - 1, 28),
        userId,
      },
    });

    const statement = await periods.statement(CLOSED_YEAR, CLOSED_MONTH);
    expect(statement.isClosed).toBe(true);
    expect(statement.netProfit).toBe('22000.00'); // snapshot holds
    // …and the drift is surfaced rather than hidden.
    expect(statement.liveFigures?.netProfit).toBe('17000.00'); // 22000 − 5000
  });

  it('reopens the month and lets corrections through again', async () => {
    await periods.reopen(CLOSED_YEAR, CLOSED_MONTH, 'late invoice', userId);

    const updated = await expenses.update(marchExpenseId, { amount: 9000 }, userId, true);
    expect(updated.amount.toString()).toBe('9000');

    // Now open, the statement tracks live figures again.
    const statement = await periods.statement(CLOSED_YEAR, CLOSED_MONTH);
    expect(statement.isClosed).toBe(false);
    expect(statement.netProfit).toBe('16000.00'); // 30000 − (9000 + 5000)
  });
});
