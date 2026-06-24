import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

/**
 * Money helpers. ALL monetary math goes through Decimal to avoid IEEE-754
 * floating point errors. Values are rounded to 2 dp (half-up) when finalized.
 *
 * Prisma returns Decimal (Prisma.Decimal) which is decimal.js-compatible.
 */
export const MONEY_DP = 2;

export type MoneyInput = number | string | Decimal | Prisma.Decimal;

export function money(value: MoneyInput = 0): Decimal {
  return new Decimal(value as Decimal.Value);
}

/** Round to 2dp using banker-safe half-up rounding for currency. */
export function round(value: MoneyInput): Decimal {
  return money(value).toDecimalPlaces(MONEY_DP, Decimal.ROUND_HALF_UP);
}

export function add(...values: MoneyInput[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(money(v)), money(0));
}

export function sub(a: MoneyInput, b: MoneyInput): Decimal {
  return money(a).minus(money(b));
}

export function mul(a: MoneyInput, b: MoneyInput): Decimal {
  return money(a).times(money(b));
}

export function isNegative(value: MoneyInput): boolean {
  return money(value).isNegative();
}

/** Convert to the Prisma.Decimal type for persistence (rounded to 2dp). */
export function toPrisma(value: MoneyInput): Prisma.Decimal {
  return new Prisma.Decimal(round(value).toString());
}

/** Serialize a Decimal to a plain string for API responses (preserves precision). */
export function toJson(value: MoneyInput): string {
  return round(value).toFixed(MONEY_DP);
}
