/* eslint-disable no-console */
/**
 * Moves stock that was entered at shop setup onto the opening-stock footing it
 * should have had, and undoes the damage that entering it any other way did.
 *
 * Why this exists: until the Opening Stock screen there was no way to say "this
 * was already on the shelf when we started". Both available routes were wrong,
 * in opposite directions:
 *
 *   - Recorded as a PURCHASE, the money came out of today's till. A shop
 *     opening with 74m of stock left the drawer expecting minus 74m, and every
 *     banking and withdrawal after that was refused for insufficient cash.
 *   - Recorded as a positive ADJUSTMENT, the profit figures read it as the
 *     opposite of wastage — `stockLoss = writtenOff - writtenOn` — so the same
 *     74m came back as 74m of profit nobody earned, and the Stock Wastage card
 *     showed minus 74m.
 *
 * Neither is what happened. The stock is real and cost real money, but that
 * money left long before today, and none of it was lost. So both are moved to
 * reason OPENING_STOCK, which every profit and wastage figure now excludes.
 *
 * Nothing about the physical position changes: stock levels, FIFO batches and
 * their costs are left exactly as they are, so COGS on what has already been
 * sold is untouched. Only the classification moves.
 *
 * Usage:
 *   node scripts/reclassify-opening-stock.mjs --scan     # list candidates only
 *   node scripts/reclassify-opening-stock.mjs            # dry run
 *   node scripts/reclassify-opening-stock.mjs --apply    # commit
 *
 *   --before 2026-09-01   treat anything before this date as setup
 *                         (default: the date of the shop's first completed sale)
 *   --adjustments-only    leave purchases alone
 *   --purchases-only      leave adjustments alone
 *
 * The dry run does the real work inside a transaction and rolls it back, so the
 * numbers it prints are exactly what --apply would leave behind. Re-running is
 * a no-op: rows already on OPENING_STOCK are never picked up again.
 */
import { PrismaClient } from '@prisma/client';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : undefined;
};
const SCAN = args.includes('--scan');
const APPLY = args.includes('--apply');
const ADJ_ONLY = args.includes('--adjustments-only');
const PUR_ONLY = args.includes('--purchases-only');
const BEFORE = flag('before');

const prisma = new PrismaClient();

const money = (v) =>
  Number(v ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Trading starts at the first sale. Anything stocked before the shop sold
 * anything is setup by definition, which is a better cutoff than a date typed
 * from memory — though --before overrides it when the shop traded on paper for
 * a while before the system caught up.
 */
async function resolveCutoff() {
  if (BEFORE) {
    const d = new Date(BEFORE);
    if (Number.isNaN(d.getTime())) {
      throw new Error(`--before ${BEFORE} is not a date I can read (use YYYY-MM-DD).`);
    }
    return { cutoff: d, source: `--before ${BEFORE}` };
  }
  const firstSale = await prisma.sale.findFirst({
    where: { status: 'COMPLETED' },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true, invoiceNumber: true },
  });
  if (!firstSale) {
    return { cutoff: new Date(), source: 'no sales yet — everything so far is setup' };
  }
  return {
    cutoff: firstSale.createdAt,
    source: `first completed sale (${firstSale.invoiceNumber}, ${firstSale.createdAt.toISOString().slice(0, 10)})`,
  };
}

/**
 * Positive adjustments made before trading started. FOUND, COUNT_CORRECTION and
 * OTHER are the three reasons the old screen offered for stock coming in, so
 * they are the three a setup ended up under.
 */
async function findAdjustments(cutoff) {
  return prisma.inventoryAdjustment.findMany({
    where: {
      quantityChange: { gt: 0 },
      createdAt: { lt: cutoff },
      reasonCode: { in: ['FOUND', 'COUNT_CORRECTION', 'OTHER'] },
    },
    orderBy: { createdAt: 'asc' },
    include: {
      product: { select: { name: true, baseUnit: true } },
      variant: { select: { label: true } },
    },
  });
}

/**
 * Purchases made before trading started, with a verdict on whether they can be
 * moved. A purchase whose stock has already been sold cannot: unpicking it
 * would have to restate the COGS on those sales, and a guess about setup is not
 * worth restating real trading over.
 */
async function findPurchases(cutoff) {
  const purchases = await prisma.purchase.findMany({
    where: { createdAt: { lt: cutoff }, status: 'COMPLETED' },
    orderBy: { createdAt: 'asc' },
    include: {
      items: true,
      supplier: { select: { id: true, name: true } },
      batches: true,
      payments: { select: { id: true, amount: true } },
    },
  });

  return purchases.map((p) => {
    const consumed = p.batches.filter((b) => b.remainingQuantity !== b.quantity);
    let blocker = null;
    if (p.batches.length === 0) {
      blocker = 'no FIFO batches behind it — nothing to move';
    } else if (consumed.length > 0) {
      blocker = `${consumed.length} of its ${p.batches.length} batch(es) already partly sold`;
    } else if (p.payments.length > 0) {
      blocker = `${p.payments.length} supplier payment(s) settle against it`;
    }
    return { purchase: p, blocker };
  });
}

/** Relabels one adjustment and the ledger movement it wrote. */
async function moveAdjustment(tx, adj) {
  await tx.inventoryAdjustment.update({
    where: { id: adj.id },
    data: { reasonCode: 'OPENING_STOCK', reason: 'Opening stock (reclassified)' },
  });
  // The movement row carries no link back to the adjustment, so it is matched
  // on the four things that identify it: same variant, same size of change,
  // same resulting quantity, same moment.
  const window = 5000;
  const { count } = await tx.inventoryMovement.updateMany({
    where: {
      variantId: adj.variantId,
      type: 'ADJUSTMENT',
      quantity: adj.quantityChange,
      afterQty: adj.afterQty,
      createdAt: {
        gte: new Date(adj.createdAt.getTime() - window),
        lte: new Date(adj.createdAt.getTime() + window),
      },
    },
    data: { type: 'OPENING', referenceType: 'OPENING' },
  });
  return count;
}

/**
 * Turns one purchase into opening stock: an adjustment row per line, the ledger
 * movement relabelled, the till released, and the purchase itself removed.
 *
 * The FIFO batches are deliberately left where they are. They hold the cost the
 * stock was booked at and, once the purchase rows go, Prisma nulls their
 * purchaseId for us — so valuation and COGS carry on reading exactly what they
 * read before.
 */
async function movePurchase(tx, p, userId) {
  const moves = [];
  for (const batch of p.batches) {
    const movement = await tx.inventoryMovement.findFirst({
      where: {
        variantId: batch.variantId,
        type: 'PURCHASE',
        referenceType: 'PURCHASE',
        referenceId: p.id,
      },
    });

    const costImpact = Number(batch.unitCost) * batch.quantity;
    await tx.inventoryAdjustment.create({
      data: {
        variantId: batch.variantId,
        productId: batch.productId,
        userId,
        quantityChange: batch.quantity,
        // Without the original movement there is no honest before/after, so the
        // adjustment records the change against the quantity it produced.
        beforeQty: movement ? movement.beforeQty : 0,
        afterQty: movement ? movement.afterQty : batch.quantity,
        reasonCode: 'OPENING_STOCK',
        reason: `Opening stock (was purchase ${p.purchaseNumber})`,
        unitCost: batch.unitCost,
        costImpact,
      },
    });

    if (movement) {
      await tx.inventoryMovement.update({
        where: { id: movement.id },
        data: {
          type: 'OPENING',
          referenceType: 'OPENING',
          referenceId: null,
          notes: `Opening stock (was purchase ${p.purchaseNumber})`,
        },
      });
    }
    moves.push({ variantId: batch.variantId, quantity: batch.quantity, costImpact });
  }

  // A credit purchase that was really opening stock is not a debt to anyone.
  if (p.supplier && Number(p.amountDue) > 0) {
    await tx.supplier.update({
      where: { id: p.supplier.id },
      data: { balance: { decrement: p.amountDue } },
    });
  }

  // Deleting the purchase is what releases the till: expected cash sums the
  // amountPaid of purchases linked to the session, so the drawer stops being
  // short by money that never left it. Items cascade; batches keep their costs
  // and have their purchase links nulled.
  await tx.purchaseItem.deleteMany({ where: { purchaseId: p.id } });
  await tx.purchase.delete({ where: { id: p.id } });

  return moves;
}

async function main() {
  const { cutoff, source } = await resolveCutoff();
  console.log(`\nSetup cutoff: ${cutoff.toISOString()}  (${source})`);
  console.log('Anything stocked before that is treated as the day-one shelf.\n');

  const adjustments = PUR_ONLY ? [] : await findAdjustments(cutoff);
  const purchases = ADJ_ONLY ? [] : await findPurchases(cutoff);
  const movable = purchases.filter((p) => !p.blocker);
  const blocked = purchases.filter((p) => p.blocker);

  // ---- what was found ------------------------------------------------------
  console.log(`Positive adjustments to reclassify: ${adjustments.length}`);
  let adjValue = 0;
  for (const a of adjustments) {
    const name = a.variant.label && a.variant.label !== 'Default'
      ? `${a.product.name} — ${a.variant.label}`
      : a.product.name;
    const value = Number(a.costImpact ?? 0);
    adjValue += value;
    console.log(
      `  ${a.createdAt.toISOString().slice(0, 10)}  ${name}` +
        `  +${a.quantityChange} ${a.product.baseUnit}  ${money(value)}  [${a.reasonCode}]`,
    );
  }
  if (adjustments.length) {
    console.log(`  ── value currently read as negative wastage: ${money(adjValue)}\n`);
  }

  console.log(`Purchases to reclassify: ${movable.length}`);
  let purValue = 0;
  let tillRelease = 0;
  for (const { purchase: p } of movable) {
    purValue += Number(p.totalCost);
    if (p.cashSessionId) tillRelease += Number(p.amountPaid);
    console.log(
      `  ${p.createdAt.toISOString().slice(0, 10)}  ${p.purchaseNumber}` +
        `  ${p.items.length} line(s)  ${money(p.totalCost)}` +
        `  [${p.paymentMethod}${p.cashSessionId ? ', against the till' : ''}]`,
    );
  }
  if (tillRelease > 0) {
    console.log(`  ── cash the till is wrongly short by: ${money(tillRelease)}`);
  }
  if (movable.length) console.log('');

  if (blocked.length) {
    console.log(`Purchases left alone: ${blocked.length}`);
    for (const { purchase: p, blocker } of blocked) {
      console.log(`  ${p.purchaseNumber}  ${money(p.totalCost)}  — ${blocker}`);
    }
    console.log(
      '  These are not moved. Stock from them has already been sold or settled,\n' +
        '  and rewriting that would restate real trading on a guess about setup.\n',
    );
  }

  if (adjustments.length === 0 && movable.length === 0) {
    console.log('Nothing to do.\n');
    return;
  }
  if (SCAN) {
    console.log('--scan only: nothing was changed.\n');
    return;
  }

  // Reclassified purchase lines need an author; the person who recorded the
  // purchase is the honest one to name.
  const anyUser = movable[0]?.purchase.userId;

  // ---- do the work ---------------------------------------------------------
  const ROLLBACK = Symbol('dry-run');
  const run = async (tx) => {
    let movementsRelabelled = 0;
    for (const a of adjustments) movementsRelabelled += await moveAdjustment(tx, a);

    let lines = 0;
    for (const { purchase: p } of movable) {
      const moves = await movePurchase(tx, p, p.userId ?? anyUser);
      lines += moves.length;
    }

    console.log('Result:');
    console.log(`  ${adjustments.length} adjustment(s) moved to OPENING_STOCK`);
    console.log(`  ${movementsRelabelled} ledger movement(s) relabelled OPENING`);
    console.log(`  ${movable.length} purchase(s) converted into ${lines} opening line(s)`);
    if (tillRelease > 0) {
      console.log(`  ${money(tillRelease)} returned to the till's expected cash`);
    }
    console.log(
      `  ${money(adjValue + purValue)} of stock now sits outside the profit and wastage figures`,
    );

    if (!APPLY) throw ROLLBACK;
  };

  try {
    await prisma.$transaction(run, { timeout: 120_000 });
    console.log('\nCommitted.\n');
  } catch (e) {
    if (e !== ROLLBACK) throw e;
    console.log('\nDry run — rolled back. Re-run with --apply to commit.\n');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
