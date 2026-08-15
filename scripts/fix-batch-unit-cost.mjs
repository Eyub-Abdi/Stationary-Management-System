/* eslint-disable no-console */
/**
 * Finds and repairs FIFO batches that were costed in the wrong unit, and every
 * figure downstream of them.
 *
 * Why this exists: on 2026-06-27 an "initial stock" adjustment added 2,000
 * sheets of A4 paper with the unit cost left blank, so the server fell back to
 * the variant's buyingPrice — 50,000, the price of the whole box — and applied
 * it per sheet. That valued the batch at 100,000,000 and dragged net profit
 * about 75,000,000 underwater. The same slip is possible from the purchase form
 * (a pack entered as "1 unit" at the pack price), so this scans for the whole
 * class rather than one known batch.
 *
 * The tell is a unit cost above the variant's selling price: no shop knowingly
 * buys a sheet for more than it sells one for.
 *
 * Correcting a batch alone is not enough — COGS is denormalized into
 * cogs_allocations, sale_item_consumptions, sale_items and sales — so each layer
 * is recomputed from the one below it.
 *
 * Usage:
 *   node scripts/fix-batch-unit-cost.mjs --scan            # list suspects, change nothing
 *   node scripts/fix-batch-unit-cost.mjs --batch <id> --cost 25            # dry run
 *   node scripts/fix-batch-unit-cost.mjs --batch <id> --cost 25 --apply    # commit
 *
 * The dry run does the real work inside a transaction and rolls it back, so the
 * numbers it prints are exactly what --apply would leave behind. Re-running with
 * the same cost is a no-op, so an interrupted fix is safe to repeat.
 */
import { PrismaClient } from '@prisma/client';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : undefined;
};
const SCAN = args.includes('--scan');
const APPLY = args.includes('--apply');
const BATCH_ID = flag('batch');
const NEW_COST = flag('cost');

const prisma = new PrismaClient();
const money = (v) => Number(v ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 });

/** Revenue/COGS/profit as the Reports page computes them, for before-and-after. */
async function snapshot(tx) {
  const [row] = await tx.$queryRaw`
    SELECT
      (SELECT COALESCE(SUM(total), 0) FROM sales WHERE status = 'COMPLETED')        AS revenue,
      (SELECT COALESCE(SUM("totalCogs"), 0) FROM sales WHERE status = 'COMPLETED')  AS cogs,
      (SELECT COALESCE(SUM(amount), 0) FROM expenses)                               AS expenses
  `;
  const revenue = Number(row.revenue);
  const cogs = Number(row.cogs);
  const expenses = Number(row.expenses);
  return { revenue, cogs, expenses, netProfit: revenue - cogs - expenses };
}

function report(label, s) {
  console.log(`\n  ${label}`);
  console.log(`    Revenue     ${money(s.revenue).padStart(16)}`);
  console.log(`    COGS        ${money(s.cogs).padStart(16)}`);
  console.log(`    Expenses    ${money(s.expenses).padStart(16)}`);
  console.log(`    Net profit  ${money(s.netProfit).padStart(16)}`);
}

/**
 * Every batch costing more per unit than the variant sells for. Peer costs —
 * what other batches of the same variant cost — are the best available guide to
 * what the corrected figure should be, since only the shop knows the pack size.
 */
async function scan() {
  const rows = await prisma.$queryRaw`
    SELECT b.id, p.name, v.label, p."baseUnit", b.quantity, b."remainingQuantity",
           b."unitCost", v."sellingPrice",
           (b."purchaseId" IS NOT NULL) AS from_purchase,
           (SELECT COALESCE(SUM(a.cost), 0) FROM cogs_allocations a WHERE a."batchId" = b.id) AS booked_cogs,
           (SELECT string_agg(DISTINCT b2."unitCost"::text, ', ' ORDER BY b2."unitCost"::text)
              FROM inventory_batches b2
             WHERE b2."variantId" = b."variantId" AND b2.id <> b.id
               AND b2."unitCost" <= v."sellingPrice") AS peer_costs
      FROM inventory_batches b
      JOIN product_variants v ON v.id = b."variantId"
      JOIN products p ON p.id = b."productId"
     WHERE v."sellingPrice" > 0 AND b."unitCost" > v."sellingPrice"
     ORDER BY booked_cogs DESC, b."unitCost" DESC
  `;

  if (rows.length === 0) {
    console.log('\n  No batches cost more than their selling price. Nothing to fix.\n');
    return;
  }

  console.log(`\n  ${rows.length} suspect batch(es):\n`);
  for (const r of rows) {
    const name = r.label && r.label !== 'Default' ? `${r.name} — ${r.label}` : r.name;
    console.log(`  ${name}`);
    console.log(`    batch        ${r.id}`);
    console.log(
      `    cost         ${money(r.unitCost)} per ${r.baseUnit}  (sells for ${money(r.sellingPrice)})`,
    );
    console.log(
      `    quantity     ${r.quantity} in, ${r.remainingQuantity} left` +
        `   via ${r.from_purchase ? 'purchase' : 'stock adjustment'}`,
    );
    console.log(`    COGS booked  ${money(r.booked_cogs)}`);
    console.log(
      `    other batches of this variant cost ${r.peer_costs ?? 'n/a — this is the only one'}`,
    );
    console.log(`    fix with     --batch ${r.id} --cost <correct cost per ${r.baseUnit}>\n`);
  }
  console.log('  Add --apply once a dry run looks right.\n');
}

/** Closed periods freeze their own profit figures, so they need reopening separately. */
async function closedPeriodsTouching(tx, batchId) {
  return tx.$queryRaw`
    SELECT ap.year, ap.month
      FROM accounting_periods ap
     WHERE ap.status = 'CLOSED'
       AND EXISTS (
         SELECT 1 FROM sales s
           JOIN sale_items si ON si."saleId" = s.id
           JOIN cogs_allocations a ON a."saleItemId" = si.id
          WHERE a."batchId" = ${batchId}::uuid
            AND date_part('year', s."createdAt") = ap.year
            AND date_part('month', s."createdAt") = ap.month
       )
     ORDER BY ap.year, ap.month
  `;
}

async function fix() {
  console.log(`\nBatch ${BATCH_ID}`);
  console.log(
    `Correcting unit cost to ${NEW_COST}${APPLY ? '' : '   (DRY RUN — nothing will be saved)'}`,
  );

  await prisma
    .$transaction(async (tx) => {
      const batch = await tx.inventoryBatch.findUnique({
        where: { id: BATCH_ID },
        include: { product: { select: { name: true, baseUnit: true } } },
      });
      if (!batch) throw new Error(`Batch ${BATCH_ID} not found`);

      console.log(
        `\n  ${batch.product.name}: ${batch.quantity} ${batch.product.baseUnit}` +
          ` @ ${money(batch.unitCost)} → @ ${money(NEW_COST)}` +
          `   (value ${money(batch.quantity * Number(batch.unitCost))}` +
          ` → ${money(batch.quantity * Number(NEW_COST))})`,
      );

      const closed = await closedPeriodsTouching(tx, BATCH_ID);
      if (closed.length > 0) {
        const list = closed.map((p) => `${p.year}-${String(p.month).padStart(2, '0')}`).join(', ');
        console.log(
          `\n  ! Sales from this batch fall in CLOSED accounting period(s): ${list}.` +
            `\n    Their stored profit figures will NOT change. Reopen and re-close them` +
            `\n    afterwards, or the closed books will disagree with the reports.`,
        );
      }

      const before = await snapshot(tx);

      // 1. The batch itself.
      await tx.$executeRaw`
        UPDATE inventory_batches SET "unitCost" = ${NEW_COST}::numeric WHERE id = ${BATCH_ID}::uuid
      `;

      // 2. Every allocation drawn from it. cost = unitCost * quantity.
      const allocations = await tx.$executeRaw`
        UPDATE cogs_allocations
           SET "unitCost" = ${NEW_COST}::numeric,
               cost = ${NEW_COST}::numeric * quantity
         WHERE "batchId" = ${BATCH_ID}::uuid
      `;

      // 3. Service consumptions: re-total from their own allocations.
      const consumptions = await tx.$executeRaw`
        UPDATE sale_item_consumptions c
           SET cogs = COALESCE((
                 SELECT SUM(a.cost) FROM cogs_allocations a
                  WHERE a."saleItemConsumptionId" = c.id
               ), 0)
         WHERE EXISTS (
           SELECT 1 FROM cogs_allocations a
            WHERE a."saleItemConsumptionId" = c.id AND a."batchId" = ${BATCH_ID}::uuid
         )
      `;

      // 4. Sale lines: the sum of their allocations, product and service alike.
      const items = await tx.$executeRaw`
        UPDATE sale_items si
           SET "lineCogs" = COALESCE((
                 SELECT SUM(a.cost) FROM cogs_allocations a WHERE a."saleItemId" = si.id
               ), 0)
         WHERE EXISTS (
           SELECT 1 FROM cogs_allocations a
            WHERE a."saleItemId" = si.id AND a."batchId" = ${BATCH_ID}::uuid
         )
      `;

      // 5. Sales: the sum of their lines.
      const sales = await tx.$executeRaw`
        UPDATE sales s
           SET "totalCogs" = COALESCE((
                 SELECT SUM(si."lineCogs") FROM sale_items si WHERE si."saleId" = s.id
               ), 0)
         WHERE EXISTS (
           SELECT 1 FROM sale_items si
             JOIN cogs_allocations a ON a."saleItemId" = si.id
            WHERE si."saleId" = s.id AND a."batchId" = ${BATCH_ID}::uuid
         )
      `;

      // 6. Returns reverse COGS at the cost of the allocations they gave back.
      // Allocations record only a cumulative returnedQuantity, not which return
      // took what, so this is exact for a sale line returned once — the normal
      // case — and is left alone when a line was returned in several goes.
      const returnItems = await tx.$executeRaw`
        UPDATE sale_return_items ri
           SET "cogsReversed" = COALESCE((
                 SELECT SUM(a."returnedQuantity" * a."unitCost")
                   FROM cogs_allocations a WHERE a."saleItemId" = ri."saleItemId"
               ), 0)
         WHERE EXISTS (
                 SELECT 1 FROM cogs_allocations a
                  WHERE a."saleItemId" = ri."saleItemId" AND a."batchId" = ${BATCH_ID}::uuid
               )
           AND (SELECT COUNT(*) FROM sale_return_items ri2
                 WHERE ri2."saleItemId" = ri."saleItemId") = 1
      `;

      const returns = await tx.$executeRaw`
        UPDATE sale_returns r
           SET "totalCogsReversed" = COALESCE((
                 SELECT SUM(ri."cogsReversed") FROM sale_return_items ri
                  WHERE ri."returnId" = r.id
               ), 0)
         WHERE EXISTS (
           SELECT 1 FROM sale_return_items ri
             JOIN cogs_allocations a ON a."saleItemId" = ri."saleItemId"
            WHERE ri."returnId" = r.id AND a."batchId" = ${BATCH_ID}::uuid
         )
      `;

      // Lines returned more than once can't be attributed per return; say so.
      const [multi] = await tx.$queryRaw`
        SELECT COUNT(*)::int AS n FROM sale_return_items ri
         WHERE EXISTS (
                 SELECT 1 FROM cogs_allocations a
                  WHERE a."saleItemId" = ri."saleItemId" AND a."batchId" = ${BATCH_ID}::uuid
               )
           AND (SELECT COUNT(*) FROM sale_return_items ri2
                 WHERE ri2."saleItemId" = ri."saleItemId") > 1
      `;
      if (multi.n > 0) {
        console.log(
          `\n  ! ${multi.n} returned line(s) were returned in more than one go, so their` +
            `\n    reversed COGS could not be split per return and was left as-is.`,
        );
      }

      console.log(
        `\n  Rows rewritten: ${allocations} allocations, ${consumptions} service consumptions,` +
          ` ${items} sale lines, ${sales} sales, ${returnItems} return lines, ${returns} returns`,
      );

      const after = await snapshot(tx);
      report('Before', before);
      report('After', after);

      if (!APPLY) {
        // Roll back by failing the transaction — the numbers above are still real.
        throw new DryRun();
      }
      console.log('\n  Committed.\n');
    })
    .catch((e) => {
      if (e instanceof DryRun) {
        console.log('\n  Rolled back. Re-run with --apply to keep these changes.\n');
        return;
      }
      throw e;
    });
}

class DryRun extends Error {}

async function main() {
  if (SCAN) return scan();
  if (!BATCH_ID || !NEW_COST) {
    console.log(
      '\n  Usage:\n' +
        '    node scripts/fix-batch-unit-cost.mjs --scan\n' +
        '    node scripts/fix-batch-unit-cost.mjs --batch <id> --cost <n> [--apply]\n',
    );
    process.exitCode = 1;
    return;
  }
  return fix();
}

main()
  .catch((e) => {
    console.error(`\n  Failed: ${e.message}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
