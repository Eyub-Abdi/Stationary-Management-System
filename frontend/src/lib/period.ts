import { dayEnd, dayStart } from './dateRange';
import { daysAgo, endOfToday, startOfMonth, startOfToday } from './utils';

/**
 * A reporting period. The presets answer "how are we doing lately"; the month
 * and year pickers answer "how did June go" — a question the presets could
 * never reach, since a rolling window always ends today.
 */
export type PeriodKind =
  | 'today'
  | '7d'
  | '30d'
  | 'thisMonth'
  | 'month'
  | 'year'
  | 'custom'
  | 'all';

export interface Period {
  kind: PeriodKind;
  /** 0-11, for `month`. */
  month?: number;
  /** For `month` and `year`. */
  year?: number;
  /** `YYYY-MM-DD`, for `custom`. */
  from?: string;
  to?: string;
}

export interface ResolvedPeriod {
  from?: string;
  to?: string;
  label: string;
  /**
   * How the sales series should be bucketed. A year of daily points is an
   * unreadable axis; a week of monthly ones is a single bar.
   */
  granularity: 'DAILY' | 'MONTHLY';
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** For the month grid, where twelve full names would not fit four to a row. */
export const MONTH_ABBR = MONTH_NAMES.map((m) => m.slice(0, 3));

/** Local-midnight ISO bounds for a whole month. */
function monthBounds(year: number, month: number) {
  return {
    from: new Date(year, month, 1, 0, 0, 0, 0).toISOString(),
    to: new Date(year, month + 1, 0, 23, 59, 59, 999).toISOString(),
  };
}

function yearBounds(year: number) {
  return {
    from: new Date(year, 0, 1, 0, 0, 0, 0).toISOString(),
    to: new Date(year, 11, 31, 23, 59, 59, 999).toISOString(),
  };
}

export function resolvePeriod(p: Period): ResolvedPeriod {
  const now = new Date();
  const to = endOfToday();

  switch (p.kind) {
    case 'today':
      return { from: startOfToday(), to, label: 'Today', granularity: 'DAILY' };
    case '7d':
      return { from: daysAgo(6), to, label: 'Last 7 days', granularity: 'DAILY' };
    case '30d':
      return { from: daysAgo(29), to, label: 'Last 30 days', granularity: 'DAILY' };
    case 'thisMonth':
      return {
        from: startOfMonth(),
        to,
        label: `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`,
        granularity: 'DAILY',
      };
    case 'month': {
      const year = p.year ?? now.getFullYear();
      const month = p.month ?? now.getMonth();
      return {
        ...monthBounds(year, month),
        label: `${MONTH_NAMES[month]} ${year}`,
        granularity: 'DAILY',
      };
    }
    case 'year': {
      const year = p.year ?? now.getFullYear();
      return { ...yearBounds(year), label: String(year), granularity: 'MONTHLY' };
    }
    case 'custom': {
      const from = dayStart(p.from ?? '');
      const end = dayEnd(p.to ?? '');
      // A long custom span gets monthly buckets for the same reason a year does.
      const days =
        from && end
          ? (new Date(end).getTime() - new Date(from).getTime()) / 86_400_000
          : 0;
      return {
        from,
        to: end,
        label:
          p.from && p.to
            ? `${p.from} to ${p.to}`
            : p.from
              ? `From ${p.from}`
              : p.to
                ? `Up to ${p.to}`
                : 'Custom range',
        granularity: days > 92 ? 'MONTHLY' : 'DAILY',
      };
    }
    case 'all':
    default:
      // No bounds at all: the API leaves the date filter off entirely rather
      // than us inventing an epoch the business didn't start at.
      return { label: 'All time', granularity: 'MONTHLY' };
  }
}

/**
 * How far back the year stepper will go. The shop's records start when the
 * system was first used, so there is nothing to see before this.
 */
export const FIRST_YEAR = 2026;
