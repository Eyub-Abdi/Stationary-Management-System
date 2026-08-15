import { ConflictException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { money } from '../../common/utils/money';

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
 */
export function assertCostPerBaseUnit(
  unitCost: Decimal,
  variant: { sellingPrice: Decimal | { toString(): string } },
  units: { baseUnit: string; bulkUnit?: string | null; unitSize?: number },
): void {
  const sellingPrice = money(variant.sellingPrice.toString());

  // A variant priced at 0 is not yet set up for sale, so there is nothing to
  // compare against; let it through rather than block stock-taking.
  if (sellingPrice.lte(0) || unitCost.lte(sellingPrice)) return;

  const { baseUnit, bulkUnit, unitSize } = units;
  // Show the arithmetic they most likely meant: pack price ÷ pack size.
  const perBase =
    bulkUnit && unitSize && unitSize > 1
      ? ` If ${unitCost.toFixed(2)} is the price of a ${bulkUnit} of ${unitSize}, the cost per ${baseUnit} is ${unitCost.dividedBy(unitSize).toFixed(2)}.`
      : '';

  throw new ConflictException(
    `Unit cost ${unitCost.toFixed(2)} is above the selling price ${sellingPrice.toFixed(2)}. ` +
      `Enter the cost of ONE ${baseUnit}, not of a whole ${bulkUnit ?? 'pack'}.${perBase}`,
  );
}
