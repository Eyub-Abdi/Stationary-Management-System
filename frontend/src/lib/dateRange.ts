import { daysAgo, endOfToday, startOfToday } from './utils';

/** Preset date-range keys shared by the Sales, Purchases and Expenses lists. */
export type RangeKey = 'all' | 'today' | '7d' | '30d' | 'custom';

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
  switch (key) {
    case 'today':
      return { from: startOfToday(), to: endOfToday() };
    case '7d':
      return { from: daysAgo(6), to: endOfToday() };
    case '30d':
      return { from: daysAgo(29), to: endOfToday() };
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
