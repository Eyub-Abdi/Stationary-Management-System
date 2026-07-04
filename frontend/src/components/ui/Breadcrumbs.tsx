import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export interface Crumb {
  label: string;
  /** Omit on the last (current) crumb to render it as plain text. */
  to?: string;
}

/**
 * Django-admin style breadcrumb trail: `Home › Customers › Ali Othman`.
 * Links are clickable; the final crumb is the current page (plain text).
 */
export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn('text-body-sm', className)}>
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <Fragment key={i}>
              <li className="flex items-center">
                {item.to && !last ? (
                  <Link
                    to={item.to}
                    className="font-medium text-on-surface-variant hover:text-primary hover:underline underline-offset-2"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span className={last ? 'font-semibold text-on-surface' : 'text-on-surface-variant'}>
                    {item.label}
                  </span>
                )}
              </li>
              {!last && (
                <li aria-hidden className="text-outline">
                  ›
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
