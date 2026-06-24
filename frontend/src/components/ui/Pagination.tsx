import type { PageMeta } from '@/types';
import { Button } from './Button';

export function Pagination({
  meta,
  onPage,
}: {
  meta: PageMeta | undefined;
  onPage: (page: number) => void;
}) {
  if (!meta || meta.total === 0) return null;
  const from = (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.page * meta.limit, meta.total);

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-outline-variant px-5 py-3 sm:flex-row">
      <p className="text-[13px] text-on-surface-variant">
        Showing <span className="font-semibold text-on-surface">{from}</span>–
        <span className="font-semibold text-on-surface">{to}</span> of{' '}
        <span className="font-semibold text-on-surface">{meta.total}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          icon="chevron_left"
          disabled={!meta.hasPreviousPage}
          onClick={() => onPage(meta.page - 1)}
        >
          Prev
        </Button>
        <span className="px-2 text-[13px] font-semibold text-on-surface">
          {meta.page} / {meta.totalPages}
        </span>
        <Button
          size="sm"
          variant="outline"
          iconRight="chevron_right"
          disabled={!meta.hasNextPage}
          onClick={() => onPage(meta.page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
