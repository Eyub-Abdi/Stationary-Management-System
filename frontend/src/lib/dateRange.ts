import { daysAgo, endOfToday, startOfToday } from './utils';

/** Preset date-range keys shared by the Sales, Purchases and Expenses lists.
 *  `m:YYYY-MM` picks one whole calendar month — a month is the unit the shop
 *  actually thinks in, and typing two dates to get one is busywork. */
export type RangeKey =
  | 'all'
  | 'today'
  | 'this-month'
  | 'last-month'
  | '7d'
  | 'custom'
  | `m:${string}`;

/** The range key for the calendar month an ISO datetime falls in. */
export function monthKeyOf(iso: string | Date): RangeKey | null {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `m:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** "June 2026" for an `m:YYYY-MM` key. */
export function monthKeyLabel(key: string): string {
  const [year, month] = key.slice(2).split('-').map(Number);
  if (!year || !month) return key;
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

/** Whole-month bounds from a year and a 1-based month. */
function monthRange(year: number, month: number): { from: string; to: string } {
  return {
    from: new Date(year, month - 1, 1, 0, 0, 0, 0).toISOString(),
    // Day 0 of the next month is the last day of this one.
    to: new Date(year, month, 0, 23, 59, 59, 999).toISOString(),
  };
}

/** Local start-of-day ISO for a `YYYY-MM-DD` input value. */
export function dayStart(date: string): string | undefined {
  if (!date) return undefined;
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Local end-of-day ISO for a `YYYY-MM-DD` input value. */
export function dayEnd(date: string): string | undefined {
  if (!date) return undefined;
  const d = new Date(`${date}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Resolve a preset (or custom from/to) into an ISO {from,to} range. */
export function rangeFor(
  key: RangeKey,
  customFrom: string,
  customTo: string,
): { from?: string; to?: string } {
  // A specific month, e.g. `m:2026-06`.
  if (key.startsWith('m:')) {
    const [year, month] = key.slice(2).split('-').map(Number);
    return year && month ? monthRange(year, month) : {};
  }

  const now = new Date();
  switch (key) {
    case 'today':
      return { from: startOfToday(), to: endOfToday() };
    case 'this-month':
      return monthRange(now.getFullYear(), now.getMonth() + 1);
    case 'last-month':
      // getMonth() is 0-based, so this is the month before the current one and
      // rolls back into December of the previous year on its own.
      return monthRange(now.getFullYear(), now.getMonth());
    case '7d':
      return { from: daysAgo(6), to: endOfToday() };
    case 'custom':
      return { from: dayStart(customFrom), to: dayEnd(customTo) };
    default:
      return {};
  }
}

/** `YYYY-MM-DD` (local) for an ISO datetime — used to seed the custom-range inputs. */
export function toDateInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The `YYYY-MM-DD` first and last day of the month an ISO datetime falls in.
 *  Used to drill from a monthly total down into that month's days. */
export function monthBounds(iso: string): { first: string; last: string } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = d.getFullYear();
  const m = d.getMonth();
  // Day 0 of the next month is the last day of this one.
  const lastDay = new Date(y, m + 1, 0).getDate();
  return {
    first: `${y}-${pad(m + 1)}-01`,
    last: `${y}-${pad(m + 1)}-${pad(lastDay)}`,
  };
}
