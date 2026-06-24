/* eslint-disable no-console */
// One-off reconciliation: some products have a denormalized `currentStock` that
// isn't backed by costed FIFO `InventoryBatch` rows, so sales fail with
// "Insufficient inventory batches…" and valuation reads 0. For every product
// where currentStock exceeds the sum of remaining batch quantity, this backfills
// a single opening batch (priced at the product's reference buyingPrice) to
// cover the gap. It does NOT change currentStock, so nothing is double-counted,
// and it is idempotent — re-running it finds no gap and does nothing.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany();
  let fixed = 0;

  for (const p of products) {
    if (p.currentStock <= 0) continue;

    const agg = await prisma.inventoryBatch.aggregate({
      where: { productId: p.id },
      _sum: { remainingQuantity: true },
    });
    const batched = agg._sum.remainingQuantity ?? 0;
    const gap = p.currentStock - batched;
    if (gap <= 0) continue;

    await prisma.inventoryBatch.create({
      data: {
        productId: p.id,
        quantity: gap,
        remainingQuantity: gap,
        unitCost: p.buyingPrice, // Decimal; 0 if no reference cost was set
        purchaseDate: p.createdAt,
      },
    });
    fixed++;
    console.log(
      `+ ${p.name.padEnd(28)} backfilled ${String(gap).padStart(4)} units @ ${p.buyingPrice.toString()}`,
    );
  }

  console.log(fixed === 0 ? '✓ Inventory already consistent.' : `✓ Reconciled ${fixed} product(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
