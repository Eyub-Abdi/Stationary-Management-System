import { StockAdjustmentReason } from '@prisma/client';

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
