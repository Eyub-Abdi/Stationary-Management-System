import { createContext, useContext } from 'react';
import { cn } from '@/lib/utils';
import { Icon } from './Icon';

/** Which way a column is ordered. */
export type SortDir = 'asc' | 'desc';

/** The column a table is currently ordered by, and in which direction. */
export interface SortState {
  by: string;
  dir: SortDir;
}

interface SortContext {
  sort: SortState;
  onSort: (key: string, preferred: SortDir) => void;
}

// Set by THead so every TH beneath it can render itself as a sort control
// without each page threading the same two props through every column.
const SortCtx = createContext<SortContext | null>(null);

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full border-collapse text-left', className)}>{children}</table>
    </div>
  );
}

export function THead({
  children,
  sort,
  onSort,
}: {
  children: React.ReactNode;
  /** Pass both to make the columns that carry a `sortKey` clickable. */
  sort?: SortState;
  onSort?: (key: string, preferred: SortDir) => void;
}) {
  const row = (
    <tr className="text-label-caps uppercase tracking-wide text-on-surface-variant">{children}</tr>
  );
  return (
    <thead className="border-b border-outline-variant bg-surface-container-low">
      {sort && onSort ? (
        <SortCtx.Provider value={{ sort, onSort }}>{row}</SortCtx.Provider>
      ) : (
        row
      )}
    </thead>
  );
}

export function TH({
  children,
  className,
  align = 'left',
  sortKey,
  sortDefault = 'asc',
}: {
  children?: React.ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
  /** Name the API (or the client sorter) knows this column by. */
  sortKey?: string;
  /** Direction the first click sorts in — descending suits money and dates. */
  sortDefault?: SortDir;
}) {
  const ctx = useContext(SortCtx);
  const cell = cn(
    'whitespace-nowrap px-5 py-3 font-semibold',
    align === 'right' && 'text-right',
    align === 'center' && 'text-center',
    className,
  );

  if (!ctx || !sortKey) return <th className={cell}>{children}</th>;

  const active = ctx.sort.by === sortKey;
  return (
    <th
      scope="col"
      aria-sort={active ? (ctx.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn(cell, 'p-0')}
    >
      <button
        type="button"
        onClick={() => ctx.onSort(sortKey, sortDefault)}
        title={`Sort by ${typeof children === 'string' ? children.toLowerCase() : 'this column'}`}
        className={cn(
          'group flex w-full items-center gap-1 px-5 py-3 uppercase tracking-wide transition-colors',
          'hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          active && 'text-on-surface',
          align === 'right' && 'justify-end',
          align === 'center' && 'justify-center',
        )}
      >
        <span>{children}</span>
        <Icon
          name={active ? (ctx.sort.dir === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
          size={16}
          className={cn(
            'shrink-0 transition-opacity',
            active ? 'text-primary opacity-100' : 'opacity-40 group-hover:opacity-100',
          )}
        />
      </button>
    </th>
  );
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-outline-variant">{children}</tbody>;
}

export function TR({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        'transition-colors hover:bg-surface-container-low',
        onClick && 'cursor-pointer',
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function TD({
  children,
  className,
  align = 'left',
  colSpan,
}: {
  children?: React.ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        'px-5 py-3.5 text-body-sm text-on-surface',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </td>
  );
}
