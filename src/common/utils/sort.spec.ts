import { resolveOrderBy, SortMap } from './sort';

interface Order {
  name?: 'asc' | 'desc';
  total?: 'asc' | 'desc';
}

const MAP: SortMap<Order[]> = {
  name: (dir) => [{ name: dir }],
  total: (dir) => [{ total: dir }],
};

const FALLBACK: Order[] = [{ name: 'asc' }];

describe('resolveOrderBy', () => {
  it('orders by a whitelisted column in the direction asked for', () => {
    expect(resolveOrderBy({ sortBy: 'total', sortDir: 'asc' }, MAP, FALLBACK)).toEqual([
      { total: 'asc' },
    ]);
  });

  it('defaults to descending when only a column is given', () => {
    expect(resolveOrderBy({ sortBy: 'total' }, MAP, FALLBACK)).toEqual([{ total: 'desc' }]);
  });

  it('keeps the list default when nothing is asked for', () => {
    expect(resolveOrderBy({}, MAP, FALLBACK)).toBe(FALLBACK);
  });

  it('ignores a column the list does not offer', () => {
    // A hand-typed query must not reach a field the list never exposes.
    expect(resolveOrderBy({ sortBy: 'passwordHash', sortDir: 'asc' }, MAP, FALLBACK)).toBe(
      FALLBACK,
    );
  });
});
