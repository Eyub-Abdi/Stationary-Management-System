import { Prisma, StockAdjustmentReason } from '@prisma/client';

/**
 * Human labels for the adjustment categories. Kept server-side so exports, the
 * audit trail and the API all name a reason the same way, and so a blank note
 * can be filled in with something readable.
 */
export const REASON_LABELS: Record<StockAdjustmentReason, string> = {
  JAM: 'Printer jam / misprint',
  SPOILED: 'Spoiled in handling',
  DAMAGED: 'Damaged goods',
  EXPIRED: 'Expired',
  LOST: 'Lost / missing',
  THEFT: 'Theft',
  COUNT_CORRECTION: 'Stock count correction',
  FOUND: 'Stock found',
  OPENING_STOCK: 'Opening stock',
  OTHER: 'Other',
};

/**
 * The subset a cashier may record from the POS. Deliberately narrow: these are
 * the things that go wrong during a job. Recounts, theft write-offs and adding
 * stock back on stay with whoever holds the `inventory` permission, because
 * those are the ones worth a second pair of eyes.
 */
export const POS_WASTAGE_REASONS: StockAdjustmentReason[] = [
  StockAdjustmentReason.JAM,
  StockAdjustmentReason.SPOILED,
  StockAdjustmentReason.DAMAGED,
];

/**
 * Reasons that describe stock genuinely destroyed or gone, as opposed to the
 * books being brought back in line with a shelf. Both cost the shop money and
 * both hit the profit figures; this split only drives reporting, so a run of
 * count corrections can be told apart from a run of jams.
 */
export const LOSS_REASONS: StockAdjustmentReason[] = [
  StockAdjustmentReason.JAM,
  StockAdjustmentReason.SPOILED,
  StockAdjustmentReason.DAMAGED,
  StockAdjustmentReason.EXPIRED,
  StockAdjustmentReason.LOST,
  StockAdjustmentReason.THEFT,
];

export function isLossReason(reason: StockAdjustmentReason): boolean {
  return LOSS_REASONS.includes(reason);
}

/**
 * Opening stock is the shelf as it stood on the day the shop started using the
 * system. It is entered through its own screen, never through the adjustment
 * form, and it is the one reason that means no money changed hands today.
 *
 * It still carries a real FIFO cost — that is the whole point, so the first
 * sale off that shelf reports honest COGS — but it is neither a purchase nor a
 * loss, and every profit and wastage figure has to leave it out. Reading it as
 * the opposite of wastage is what turned a 74m setup into 74m of profit that
 * was never earned; reading it as a purchase is what drove the till tens of
 * millions negative. So the exclusion lives here, once, and the reports use it
 * rather than each remembering the rule.
 */
export function isOpeningStock(reason: StockAdjustmentReason): boolean {
  return reason === StockAdjustmentReason.OPENING_STOCK;
}

/** Prisma filter: adjustments that represent actual trading activity. */
export const TRADING_ADJUSTMENTS = {
  reasonCode: { not: StockAdjustmentReason.OPENING_STOCK },
} satisfies Prisma.InventoryAdjustmentWhereInput;

/**
 * The same rule for the raw-SQL reports, which need the table alias they were
 * written with (or none, where the query has a single table).
 */
export function tradingAdjustmentsSql(alias?: string): Prisma.Sql {
  const column = alias ? `${alias}."reasonCode"` : '"reasonCode"';
  return Prisma.sql`AND ${Prisma.raw(column)} <> 'OPENING_STOCK'`;
}
