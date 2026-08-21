import type { SortDir } from '../dto/pagination.dto';

/** What a list is willing to be ordered by: column name -> Prisma orderBy. */
export type SortMap<T> = Record<string, (dir: SortDir) => T>;

/**
 * Turns the client's `sortBy`/`sortDir` into a Prisma `orderBy`.
 *
 * `map` is the whitelist — only the columns a list names can be ordered by, so
 * a hand-typed query cannot reach into a field the list never shows. Anything
 * unrecognised (or absent) keeps the default order, which every list still
 * decides for itself.
 */
export function resolveOrderBy<T>(
  query: { sortBy?: string; sortDir?: SortDir },
  map: SortMap<T>,
  fallback: T,
): T {
  const build = query.sortBy ? map[query.sortBy] : undefined;
  if (!build) return fallback;
  return build(query.sortDir === 'asc' ? 'asc' : 'desc');
}
