import { execSync } from 'child_process';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { SequenceService } from '../../src/modules/shared/sequence.service';
import { InventoryService } from '../../src/modules/inventory/inventory.service';
import { CustomersService } from '../../src/modules/customers/customers.service';
import { SalesService } from '../../src/modules/sales/sales.service';
import { PurchasesService } from '../../src/modules/purchases/purchases.service';
import { CashService } from '../../src/modules/cash/cash.service';
import { AccountingPeriodsService } from '../../src/modules/accounting/accounting-periods.service';

/**
 * End-to-end money flow against a REAL Postgres (a throwaway DB). Unlike the
 * unit specs (which mock Prisma), this exercises the actual SQL, schema, FIFO
 * draw-down, AR allocation and cash reconciliation — catching regressions the
 * mocked tests can't.
 *
 * Gated on TEST_DATABASE_URL so it is skipped locally/CI unless a disposable
 * database is provided (it is migrated and truncated by this suite):
 *   TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/kj_test npm run test:int
 */
const TEST_DB = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DB ? describe : describe.skip;

describeDb('Money flow (integration)', () => {
  let prisma: PrismaService;
  let sales: SalesService;
  let purchases: PurchasesService;
  let customers: CustomersService;
  let cash: CashService;

  let userId: string;
  let sessionId: string;
  let productId: string;
  // Stock and pricing live on the variant; every product has at least one.
  let variantId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    // Bring the throwaway DB up to the current schema.
    execSync('npx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: TEST_DB },
      stdio: 'ignore',
    });

    prisma = new PrismaService();
    await prisma.$connect();

    const audit = new AuditService(prisma);
    const sequences = new SequenceService();
    const inventory = new InventoryService();
    customers = new CustomersService(prisma, audit);
    // Real period service: no month is closed here, so the lock lets writes through.
    const periods = new AccountingPeriodsService(prisma, audit);
    sales = new SalesService(prisma, inventory, sequences, audit, customers, periods);
    purchases = new PurchasesService(prisma, inventory, sequences, audit, periods);
    cash = new CashService(prisma, audit);

    // Clean slate (order-independent thanks to CASCADE).
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        customer_payment_allocations, customer_payments, supplier_payments,
        cogs_allocations, sale_return_items, sale_returns, sale_items, sales,
        purchase_items, inventory_batches, inventory_movements, purchases,
        cash_movements, expenses, cash_sessions, customers, suppliers,
        products, document_sequences, audit_logs, users
      RESTART IDENTITY CASCADE;
    `);

    const user = await prisma.user.create({
      data: { email: `int_${Date.now()}@test.local`, passwordHash: 'x', fullName: 'Int Tester', role: 'ADMIN' },
    });
    userId = user.id;

    const session = await prisma.cashSession.create({
      data: { userId, openingBalance: '100000' },
    });
    sessionId = session.id;

    const stamp = Date.now();
    const product = await prisma.product.create({
      data: {
        sku: `INT-${stamp}`,
        name: 'Test Pen',
        variants: {
          create: {
            sku: `INT-${stamp}-V`,
            label: 'Default',
            sellingPrice: '1000',
            currentStock: 0,
            isDefault: true,
          },
        },
      },
      include: { variants: true },
    });
    productId = product.id;
    variantId = product.variants[0].id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('purchases stock (cash) and builds a FIFO batch', async () => {
    await purchases.create(
      {
        purchaseDate: new Date(),
        paymentMethod: 'CASH',
        items: [{ variantId, quantity: 100, unitCost: 500 }],
      },
      userId,
    );

    const v = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
    expect(v.currentStock).toBe(100);
    const batch = await prisma.inventoryBatch.findFirstOrThrow({ where: { variantId } });
    expect(batch.remainingQuantity).toBe(100);
    expect(batch.unitCost.toString()).toBe('500');
  });

  it('rings a cash sale: draws stock FIFO, books COGS and change', async () => {
    const sale = await sales.create(
      { cashSessionId: sessionId, items: [{ itemType: 'PRODUCT', variantId, quantity: 10 }], cashReceived: 12000 },
      userId,
    );
    expect(sale.total.toString()).toBe('10000');
    expect(sale.changeGiven.toString()).toBe('2000');
    expect(sale.totalCogs.toString()).toBe('5000'); // 10 × 500

    const v = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
    expect(v.currentStock).toBe(90);
  });

  it('rings a credit sale within the limit and grows the receivable', async () => {
    const customer = await prisma.customer.create({
      data: { name: 'Debtor One', creditLimit: '50000' },
    });

    const sale = await sales.create(
      {
        cashSessionId: sessionId,
        items: [{ itemType: 'PRODUCT', variantId, quantity: 5 }],
        paymentMethod: 'CREDIT',
        customerId: customer.id,
        cashReceived: 0,
      },
      userId,
    );
    expect(sale.amountDue.toString()).toBe('5000');

    const c = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(c.balance.toString()).toBe('5000');

    // A repayment allocates to the invoice (per-invoice AR).
    await customers.recordPayment(customer.id, { amount: 2000 }, userId);
    const after = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(after.balance.toString()).toBe('3000');
    const inv = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } });
    expect(inv.amountDue.toString()).toBe('3000'); // invoice reduced, not just the balance
  });

  it('rejects a credit sale that breaches the credit limit', async () => {
    const customer = await prisma.customer.create({
      data: { name: 'Tight Limit', creditLimit: '1000' },
    });
    await expect(
      sales.create(
        {
          cashSessionId: sessionId,
          items: [{ itemType: 'PRODUCT', variantId, quantity: 5 }], // 5000 > 1000
          paymentMethod: 'CREDIT',
          customerId: customer.id,
          cashReceived: 0,
        },
        userId,
      ),
    ).rejects.toThrow(/credit limit exceeded/i);
  });

  it('reconciles the till: opening + cash sales + repayments − cash purchases', async () => {
    const summary = await cash.summary(sessionId, userId, true);
    const b = summary.breakdown;
    // 100000 opening + 10000 cash sale (amountPaid) + 2000 repayment − 50000 purchase
    expect(b.cashSales).toBe('10000.00');
    expect(b.customerPayments).toBe('2000.00');
    expect(b.purchases).toBe('50000.00');
    expect(b.expectedAmount).toBe('62000.00');
  });
});
