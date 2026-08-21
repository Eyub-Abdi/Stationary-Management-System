import { monthKeyLabel, monthKeyOf, type RangeKey } from '@/lib/dateRange';

/** The last `count` calendar months, newest first, as range keys. */
function recentMonths(count: number): RangeKey[] {
  const now = new Date();
  const keys: RangeKey[] = [];
  for (let i = 0; i < count; i++) {
    const key = monthKeyOf(new Date(now.getFullYear(), now.getMonth() - i, 1));
    if (key) keys.push(key);
  }
  return keys;
}

/**
 * The shared preset list for every date-range picker (Sales, Purchases,
 * Expenses). Rendered as the children of an existing `Select` so each page
 * keeps its own layout.
 *
 * A whole month is one click. Custom range stays for the odd case, but nobody
 * should have to type two dates to answer "how did June go".
 *
 * Pass `months` where the page knows which months actually have data; without
 * it the last year is offered, which needs no extra query.
 */
export function RangeOptions({ months }: { months?: RangeKey[] }) {
  const monthKeys = months?.length ? months : recentMonths(12);
  return (
    <>
      <option value="all">All time</option>
      <option value="today">Today</option>
      <option value="this-month">This month</option>
      <option value="last-month">Last month</option>
      <option value="7d">Last 7 days</option>
      <optgroup label="Month">
        {monthKeys.map((key) => (
          <option key={key} value={key}>
            {monthKeyLabel(key)}
          </option>
        ))}
      </optgroup>
      <option value="custom">Custom range</option>
    </>
  );
}
