import { cn } from '@/lib/utils';
import { Icon } from './Icon';
import { Skeleton } from './States';

type Accent = 'primary' | 'secondary' | 'error' | 'tertiary';

/**
 * The accent is carried by the icon alone — one small glyph of colour against a
 * neutral chip. Each token below is a role pair that inverts with the theme, so
 * the icon stays legible in both (the old `tertiary-fixed-dim` was a pale tan
 * that all but vanished on a white card).
 */
const ACCENT_ICON: Record<Accent, string> = {
  primary: 'text-primary',
  secondary: 'text-secondary',
  error: 'text-error',
  tertiary: 'text-on-tertiary-fixed-variant',
};

export function StatCard({
  label,
  value,
  icon,
  accent = 'primary',
  hint,
  trend,
  loading,
  footer,
}: {
  label: string;
  value: React.ReactNode;
  icon: string;
  accent?: Accent;
  hint?: string;
  trend?: { value: string; positive?: boolean };
  loading?: boolean;
  footer?: React.ReactNode;
}) {
  const down = trend?.positive === false;
  return (
    <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-container">
          <Icon name={icon} size={20} className={ACCENT_ICON[accent]} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-body-sm font-medium text-on-surface-variant">{label}</p>

          {loading ? (
            <Skeleton className="mt-2 h-7 w-28" />
          ) : (
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
              {/* Proportional figures: tabular digits look loose at this size. */}
              <span className="text-h2 font-semibold text-on-surface">{value}</span>
              {trend && (
                // Direction is stated by the arrow as well as the colour, so it
                // still reads without colour vision.
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5 text-[12px] font-semibold',
                    down ? 'text-error' : 'text-secondary',
                  )}
                >
                  <Icon name={down ? 'arrow_downward' : 'arrow_upward'} size={14} />
                  {trend.value}
                </span>
              )}
            </div>
          )}

          {hint && !loading && (
            <p className="mt-1 truncate text-[12px] text-on-surface-variant">{hint}</p>
          )}
        </div>
      </div>
      {footer}
    </div>
  );
}
