/* eslint-disable no-console */
import {
  PrismaClient,
  Role,
  PricingType,
  ServiceType,
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
      create: { ...p, status: ProductStatus.ACTIVE },
    });
  }
  console.log(`✓ ${products.length} products ready`);

  // ---- Services -----------------------------------------------------------
  const services = [
    { name: 'Printing - Black & White', type: ServiceType.PRINTING_BW, pricingType: PricingType.PER_PAGE, unitPrice: 100 },
    { name: 'Printing - Color', type: ServiceType.PRINTING_COLOR, pricingType: PricingType.PER_PAGE, unitPrice: 500 },
    { name: 'Photocopy - Black & White', type: ServiceType.PHOTOCOPY_BW, pricingType: PricingType.PER_PAGE, unitPrice: 50 },
    { name: 'Photocopy - Color', type: ServiceType.PHOTOCOPY_COLOR, pricingType: PricingType.PER_PAGE, unitPrice: 300 },
    { name: 'Scanning', type: ServiceType.SCANNING, pricingType: PricingType.PER_PAGE, unitPrice: 200 },
    { name: 'Lamination (A4)', type: ServiceType.LAMINATION, pricingType: PricingType.FIXED, unitPrice: 1000 },
  ];
  for (const s of services) {
    await prisma.service.upsert({
      where: { name: s.name },
      update: {},
      create: s,
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
