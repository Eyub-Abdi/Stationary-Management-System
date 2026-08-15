import { ConflictException } from '@nestjs/common';
import { money } from '../../common/utils/money';
import { assertCostPerBaseUnit } from './unit-cost-guard';

const SHEETS = { baseUnit: 'sheet', bulkUnit: 'box', unitSize: 2000 };

describe('assertCostPerBaseUnit', () => {
  it('allows a cost below the selling price', () => {
    expect(() => assertCostPerBaseUnit(money(25), money(100), SHEETS)).not.toThrow();
  });

  it('allows selling at cost', () => {
    expect(() => assertCostPerBaseUnit(money(100), money(100), SHEETS)).not.toThrow();
  });

  // The 2026-06-27 incident: a 50,000 box price applied to each of 2,000 sheets.
  it('rejects a pack price entered per piece', () => {
    expect(() => assertCostPerBaseUnit(money(50000), money(100), SHEETS)).toThrow(
      ConflictException,
    );
  });

  it('suggests the per-piece cost the pack price implies', () => {
    expect(() => assertCostPerBaseUnit(money(50000), money(100), SHEETS)).toThrow(
      /cost per sheet is 25.00/,
    );
  });

  it('names the base unit for single-unit products', () => {
    expect(() =>
      assertCostPerBaseUnit(money(9000), money(3000), {
        baseUnit: 'pcs',
        bulkUnit: null,
        unitSize: 1,
      }),
    ).toThrow(/cost of ONE pcs/);
  });

  // Stock-taking on a variant that has no price yet must not be blocked.
  it('skips the check when the variant is not priced', () => {
    expect(() => assertCostPerBaseUnit(money(50000), money(0), SHEETS)).not.toThrow();
  });

  it('leads with the item name and its own remedy when given one', () => {
    expect(() =>
      assertCostPerBaseUnit(money(12000), money(500), SHEETS, {
        item: 'PVC Binding cover — A3',
        remedy: 'Check the pack size.',
      }),
    ).toThrow(/^PVC Binding cover — A3: 12000.00 per sheet .* Check the pack size\.$/);
  });
});
