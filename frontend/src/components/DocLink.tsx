import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

/** A transactional document that has its own deep-linkable detail view. */
export type DocKind = 'sale' | 'purchase';

const PATH: Record<DocKind, string> = {
  sale: '/sales',
  purchase: '/purchases',
};

/** Builds the deep link to a document's detail page. */
export function docPath(kind: DocKind, id: string): string {
  return `${PATH[kind]}/${id}`;
}

/**
 * Renders an invoice / purchase number as a link into its detail view.
 * Stops click propagation so it stays clickable inside clickable table rows.
 */
export function DocLink({
  kind,
  id,
  children,
  className,
}: {
  kind: DocKind;
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      to={docPath(kind, id)}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'font-mono-data text-primary underline-offset-2 hover:underline focus-visible:underline',
        className,
      )}
    >
      {children}
    </Link>
  );
}
