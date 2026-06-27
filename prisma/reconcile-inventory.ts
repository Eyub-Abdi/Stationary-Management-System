/* eslint-disable no-console */
// One-off reconciliation: some variants have a denormalized `currentStock` that
// isn't backed by costed FIFO `InventoryBatch` rows, so sales fail with
// "Insufficient inventory batches…" and valuation reads 0. For every variant
// where currentStock exceeds the sum of remaining batch quantity, this backfills
// a single opening batch (priced at the variant's reference buyingPrice) to
// cover the gap. It does NOT change currentStock, so nothing is double-counted,
// and it is idempotent — re-running it finds no gap and does nothing.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const variants = await prisma.productVariant.findMany({
    include: { product: { select: { name: true } } },
  });
  let fixed = 0;

  for (const v of variants) {
    if (v.currentStock <= 0) continue;

    const agg = await prisma.inventoryBatch.aggregate({
      where: { variantId: v.id },
      _sum: { remainingQuantity: true },
    });
    const batched = agg._sum.remainingQuantity ?? 0;
    const gap = v.currentStock - batched;
    if (gap <= 0) continue;

    await prisma.inventoryBatch.create({
      data: {
        variantId: v.id,
        productId: v.productId,
        quantity: gap,
        remainingQuantity: gap,
        unitCost: v.buyingPrice, // Decimal; 0 if no reference cost was set
        purchaseDate: v.createdAt,
      },
    });
    fixed++;
    const label = v.label !== 'Default' ? `${v.product.name} — ${v.label}` : v.product.name;
    console.log(
      `+ ${label.padEnd(28)} backfilled ${String(gap).padStart(4)} units @ ${v.buyingPrice.toString()}`,
    );
  }

  console.log(fixed === 0 ? '✓ Inventory already consistent.' : `✓ Reconciled ${fixed} variant(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
