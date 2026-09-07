import { cn } from '@/lib/utils';
import { Icon } from './Icon';
import { Skeleton } from './States';

/**
 * Semantic hues first — `blue`, `emerald`, … — so a row of cards can be given
 * four different colours without pretending they are four different meanings.
 * The four older role names stay as aliases; existing call sites keep working.
 */
type Accent =
  | 'blue'
  | 'emerald'
  | 'amber'
  | 'orange'
  | 'rose'
  | 'violet'
  | 'cyan'
  | 'slate'
  | 'primary'
  | 'secondary'
  | 'error'
  | 'tertiary';

/**
 * Each class sets `--c-stat` (see index.css) and everything below reads it
 * through the `stat` Tailwind colour, so the whole card retints from one
 * variable — and inverts with the theme, which a fixed hex could not.
 */
const ACCENT_CLASS: Record<Accent, string> = {
  blue: 'stat-blue',
  emerald: 'stat-emerald',
  amber: 'stat-amber',
  orange: 'stat-orange',
  rose: 'stat-rose',
  violet: 'stat-violet',
  cyan: 'stat-cyan',
  slate: 'stat-slate',
  // Legacy role names.
  primary: 'stat-blue',
  secondary: 'stat-emerald',
  error: 'stat-rose',
  tertiary: 'stat-amber',
};

export function StatCard({
  label,
  value,
  icon,
  accent = 'blue',
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
    <div
      className={cn(
        ACCENT_CLASS[accent],
        'group relative overflow-hidden rounded-2xl border border-outline-variant',
        'bg-surface-container-lowest p-5 pt-6 shadow-sm',
        'transition duration-200 hover:-translate-y-0.5 hover:border-stat/40 hover:shadow-md',
      )}
    >
      {/* The accent, stated twice: a rail along the top edge and a soft bloom
          behind the icon. Both are decoration — nothing is read from colour
          alone, so the card survives a monochrome print or colour blindness. */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-stat via-stat/60 to-stat/5"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-stat/10 blur-2xl transition-opacity duration-200 group-hover:opacity-70"
      />

      <div className="relative flex items-start justify-between gap-3">
        <p className="min-w-0 truncate pt-1 text-label-caps uppercase text-on-surface-variant">
          {label}
        </p>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-stat/10 text-stat ring-1 ring-inset ring-stat/20">
          <Icon name={icon} size={20} />
        </span>
      </div>

      <div className="relative mt-2">
        {loading ? (
          <Skeleton className="h-8 w-32" />
        ) : (
          <div className="flex flex-wrap items-baseline gap-x-2">
            {/* Proportional figures: tabular digits look loose at this size. */}
            <span className="text-h2 font-semibold text-on-surface">{value}</span>
            {trend && (
              // Direction is stated by the arrow as well as the colour, so it
              // still reads without colour vision.
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold',
                  down
                    ? 'bg-error-container text-on-error-container'
                    : 'bg-secondary-container text-on-secondary-container',
                )}
              >
                <Icon name={down ? 'arrow_downward' : 'arrow_upward'} size={13} />
                {trend.value}
              </span>
            )}
          </div>
        )}

        {hint && !loading && (
          <p className="mt-1.5 truncate text-[12px] text-on-surface-variant">{hint}</p>
        )}
      </div>
      {footer}
    </div>
  );
}
