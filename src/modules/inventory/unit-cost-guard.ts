import { ConflictException } from '@nestjs/common';
import Decimal from 'decimal.js';

export type UnitInfo = {
  baseUnit: string;
  bulkUnit?: string | null;
  unitSize?: number;
};

/**
 * The remedy differs by where the cost came from. A stock adjustment asks for
 * the per-piece cost directly, so the fix is to divide it down by hand; a
 * purchase line divides it for you once the pack size is set.
 */
function defaultRemedy(unitCost: Decimal, units: UnitInfo): string {
  const { baseUnit, bulkUnit, unitSize } = units;
  const remedy = `Enter the cost of ONE ${baseUnit}, not of a whole ${bulkUnit ?? 'pack'}.`;
  return bulkUnit && unitSize && unitSize > 1
    ? `${remedy} If ${unitCost.toFixed(2)} is the price of a ${bulkUnit} of ${unitSize}, the cost per ${baseUnit} is ${unitCost.dividedBy(unitSize).toFixed(2)}.`
    : remedy;
}

/**
 * Every cost the inventory holds is per BASE unit — one sheet, one pen — because
 * that is the unit FIFO consumes in. The costly confusion is entering the price
 * of the whole pack instead: a 50,000 box of 2,000 sheets booked as 50,000 per
 * sheet values the batch at 100,000,000 and drags every profit figure after it
 * underwater. (That is not hypothetical; it happened on 2026-06-27 and went
 * unnoticed for six weeks.)
 *
 * A cost above the selling price is the tell. No shop knowingly buys a sheet for
 * more than it sells one for, so we refuse rather than warn — a bad batch is far
 * harder to unpick later than a re-typed number is now.
 *
 * `sellingPrice` must be the price the item will actually carry once this call
 * succeeds, so a purchase that raises the price in the same request is judged
 * against the new one.
 */
export function assertCostPerBaseUnit(
  unitCost: Decimal,
  sellingPrice: Decimal,
  units: UnitInfo,
  context: { item?: string; remedy?: string } = {},
): void {
  // A variant priced at 0 is not yet set up for sale, so there is nothing to
  // compare against; let it through rather than block stock-taking.
  if (sellingPrice.lte(0) || unitCost.lte(sellingPrice)) return;

  const prefix = context.item ? `${context.item}: ` : 'Unit cost ';
  throw new ConflictException(
    `${prefix}${unitCost.toFixed(2)} per ${units.baseUnit} is above the ` +
      `${sellingPrice.toFixed(2)} selling price. ` +
      `${context.remedy ?? defaultRemedy(unitCost, units)}`,
  );
}
