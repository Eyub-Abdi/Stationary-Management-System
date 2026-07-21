/* eslint-disable no-console */
import {
  PrismaClient,
  Role,
  PricingType,
  ProductStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@kjstationery.co.tz';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!Admin123';

  // ---- Bootstrap admin ----------------------------------------------------
  const passwordHash = await argon2.hash(adminPassword, { type: argon2.argon2id });
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash,
      fullName: 'System Administrator',
      role: Role.ADMIN,
      isActive: true,
    },
  });
  console.log(`✓ Admin user ready: ${admin.email}`);

  // ---- Categories ---------------------------------------------------------
  const categories = ['Writing', 'Paper', 'Office Supplies', 'Filing', 'Printing Consumables'];
  for (const name of categories) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`✓ ${categories.length} categories ready`);

  // ---- Expense categories -------------------------------------------------
  // The migration seeds these too; upserting keeps them present after a manual
  // wipe. Admins may add/rename/archive their own from Expenses → Manage.
  const expenseCategories = [
    { systemKey: 'RENT', name: 'Rent', icon: 'home_work', staffAllowed: false, sortOrder: 10 },
    { systemKey: 'SALARY', name: 'Salary', icon: 'badge', staffAllowed: false, sortOrder: 20 },
    { systemKey: 'ELECTRICITY', name: 'Electricity', icon: 'bolt', staffAllowed: false, sortOrder: 30 },
    { systemKey: 'INTERNET', name: 'Internet', icon: 'wifi', staffAllowed: false, sortOrder: 40 },
    { systemKey: 'TONER', name: 'Toner', icon: 'opacity', staffAllowed: true, sortOrder: 50 },
    { systemKey: 'PAPER', name: 'Paper', icon: 'description', staffAllowed: true, sortOrder: 60 },
    { systemKey: 'TRANSPORT', name: 'Transport', icon: 'local_shipping', staffAllowed: true, sortOrder: 70 },
    { systemKey: 'FOOD', name: 'Food', icon: 'restaurant', staffAllowed: true, sortOrder: 80 },
    { systemKey: 'OFFICE_SUPPLIES', name: 'Office / Internal Use', icon: 'business_center', staffAllowed: false, sortOrder: 90 },
    { systemKey: 'MISCELLANEOUS', name: 'Miscellaneous', icon: 'category', staffAllowed: true, sortOrder: 100 },
  ];
  for (const c of expenseCategories) {
    await prisma.expenseCategory.upsert({
      where: { systemKey: c.systemKey },
      update: {},
      create: c,
    });
  }
  console.log(`✓ ${expenseCategories.length} expense categories ready`);

  const writing = await prisma.category.findUniqueOrThrow({ where: { name: 'Writing' } });
  const paper = await prisma.category.findUniqueOrThrow({ where: { name: 'Paper' } });
  const office = await prisma.category.findUniqueOrThrow({ where: { name: 'Office Supplies' } });
  const filing = await prisma.category.findUniqueOrThrow({ where: { name: 'Filing' } });

  // ---- Products -----------------------------------------------------------
  const products = [
    { sku: 'PEN-BLU-001', name: 'Blue Ballpoint Pen', categoryId: writing.id, sellingPrice: 500, minStockLevel: 50 },
    { sku: 'A4-RM-001', name: 'A4 Paper (Ream)', categoryId: paper.id, sellingPrice: 12000, minStockLevel: 10 },
    { sku: 'NB-A5-001', name: 'A5 Notebook 96pg', categoryId: paper.id, sellingPrice: 2500, minStockLevel: 20 },
    { sku: 'FILE-BX-001', name: 'Box File', categoryId: filing.id, sellingPrice: 3500, minStockLevel: 15 },
    { sku: 'MRK-PRM-001', name: 'Permanent Marker', categoryId: writing.id, sellingPrice: 1500, minStockLevel: 30 },
    { sku: 'STP-STD-001', name: 'Stapler (Standard)', categoryId: office.id, sellingPrice: 8000, minStockLevel: 5 },
    { sku: 'ENV-WHT-001', name: 'White Envelope', categoryId: office.id, sellingPrice: 200, minStockLevel: 100 },
  ];
  for (const p of products) {
    await prisma.product.upsert({
      where: { sku: p.sku },
      update: {},
      create: {
        sku: p.sku,
        name: p.name,
        categoryId: p.categoryId,
        status: ProductStatus.ACTIVE,
        variants: {
          create: [
            {
              sku: p.sku,
              label: 'Default',
              sellingPrice: p.sellingPrice,
              minStockLevel: p.minStockLevel,
              isDefault: true,
            },
          ],
        },
      },
    });
  }
  console.log(`✓ ${products.length} products ready`);

  // ---- Services -----------------------------------------------------------
  const services = [
    { name: 'Printing - Black & White', icon: 'print', pricingType: PricingType.PER_PAGE, unitPrice: 100 },
    { name: 'Printing - Color', icon: 'print', pricingType: PricingType.PER_PAGE, unitPrice: 500 },
    { name: 'Photocopy - Black & White', icon: 'content_copy', pricingType: PricingType.PER_PAGE, unitPrice: 50 },
    { name: 'Photocopy - Color', icon: 'content_copy', pricingType: PricingType.PER_PAGE, unitPrice: 300 },
    { name: 'Scanning', icon: 'scanner', pricingType: PricingType.PER_PAGE, unitPrice: 200 },
    { name: 'Lamination (A4)', icon: 'note_stack', pricingType: PricingType.FIXED, unitPrice: 1000 },
  ];
  for (const s of services) {
    await prisma.service.upsert({
      where: { name: s.name },
      update: {},
      create: {
        name: s.name,
        icon: s.icon,
        pricingType: s.pricingType,
        variants: {
          create: [{ label: 'Standard', unitPrice: s.unitPrice, isDefault: true }],
        },
      },
    });
  }
  console.log(`✓ ${services.length} services ready`);

  console.log('\nSeed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
