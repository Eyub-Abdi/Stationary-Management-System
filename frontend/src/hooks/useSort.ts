import { useCallback, useMemo, useRef, useState } from 'react';
import type { SortDir, SortState } from '@/components/ui/Table';

/** What a client-side sort reads off a row. Null and undefined sort last. */
export type SortValue = string | number | Date | null | undefined;

function next(sort: SortState, key: string, preferred: SortDir): SortState {
  // Clicking the column already in play flips it; a new column starts in the
  // direction that reads best for what it holds.
  return sort.by === key
    ? { by: key, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
    : { by: key, dir: preferred };
}

/**
 * Sorting for a table the server pages: keeps the chosen column and direction
 * and hands back the query params the API expects. Because the rows come a
 * page at a time, the ordering has to be applied across the whole result set —
 * sorting only what is on screen would reorder a slice of an arbitrary page.
 *
 * `onChange` is where a page resets itself to page 1; a new order makes the
 * page number you were on meaningless.
 */
export function useTableSort(initial: SortState, onChange?: () => void) {
  const [sort, setSort] = useState<SortState>(initial);
  const changed = useRef(onChange);
  changed.current = onChange;

  const onSort = useCallback((key: string, preferred: SortDir) => {
    setSort((s) => next(s, key, preferred));
    changed.current?.();
  }, []);

  return {
    sort,
    onSort,
    /** Spread into the list hook's filters. */
    params: { sortBy: sort.by, sortDir: sort.dir },
  };
}

const isEmpty = (v: SortValue) => v === null || v === undefined || v === '';

function compare(a: SortValue, b: SortValue): number {
  if (a instanceof Date || b instanceof Date) return Number(a) - Number(b);
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Sorting for a table whose rows are all in hand already — a summary worked
 * out on the client, or a short list the API returns whole. `accessors` names
 * every sortable column and says what to compare it on.
 */
const NO_ROWS: never[] = [];

export function useClientSort<T>(
  rows: T[] | undefined,
  initial: SortState,
  accessors: Record<string, (row: T) => SortValue>,
) {
  const [sort, setSort] = useState<SortState>(initial);
  // Held in a ref so an inline accessor map does not re-sort on every render.
  const get = useRef(accessors);
  get.current = accessors;

  const onSort = useCallback((key: string, preferred: SortDir) => {
    setSort((s) => next(s, key, preferred));
  }, []);

  const sorted = useMemo(() => {
    const list: T[] = rows ?? NO_ROWS;
    const read = get.current[sort.by];
    if (!read) return list;
    const sign = sort.dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const left = read(a);
      const right = read(b);
      // Blanks stay at the bottom whichever way the column runs; flipping them
      // to the top would bury the rows someone is actually sorting to see.
      if (isEmpty(left) || isEmpty(right)) {
        return isEmpty(left) && isEmpty(right) ? 0 : isEmpty(left) ? 1 : -1;
      }
      return compare(left, right) * sign;
    });
  }, [rows, sort]);

  return { rows: sorted, sort, onSort };
}
