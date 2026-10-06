import { cn } from '@/lib/utils';
import { Icon } from './Icon';

export function PageHeader({
  title,
  description,
  info,
  actions,
  className,
}: {
  title: string;
  description?: string;
  /** Background on the page, kept behind an info icon beside the title. */
  info?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="text-h1 font-bold text-primary">{title}</h1>
          {info && (
            // Hover for a mouse, focus for a keyboard, and a tap focuses it on touch.
            <span className="group relative inline-flex">
              <button
                type="button"
                aria-label={`About ${title}`}
                aria-describedby="page-header-info"
                className="rounded-full p-1 text-on-surface-variant hover:bg-surface-container hover:text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                <Icon name="info" size={20} />
              </button>
              <span
                id="page-header-info"
                role="tooltip"
                className="pointer-events-none invisible absolute left-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl bg-inverse-surface px-3 py-2 text-body-sm text-inverse-on-surface opacity-0 shadow-lg transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
              >
                {info}
              </span>
            </span>
          )}
        </div>
        {description && <p className="mt-1 text-body-lg text-on-surface-variant">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}
