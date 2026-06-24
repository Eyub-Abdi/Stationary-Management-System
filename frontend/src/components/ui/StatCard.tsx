import { cn } from '@/lib/utils';
import { Icon } from './Icon';
import { Skeleton } from './States';

type Accent = 'primary' | 'secondary' | 'error' | 'tertiary';

const ACCENT_BORDER: Record<Accent, string> = {
  primary: 'border-t-primary',
  secondary: 'border-t-secondary',
  error: 'border-t-error',
  tertiary: 'border-t-tertiary-fixed-dim',
};

const ACCENT_ICON: Record<Accent, string> = {
  primary: 'text-primary',
  secondary: 'text-secondary',
  error: 'text-error',
  tertiary: 'text-tertiary-fixed-dim',
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
  return (
    <div
      className={cn(
        'rounded-2xl border border-outline-variant border-t-4 bg-surface-container-lowest p-stack-md shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md',
        ACCENT_BORDER[accent],
      )}
    >
      <div className="mb-2 flex items-start justify-between">
        <span className="text-label-caps uppercase tracking-wide text-on-surface-variant">{label}</span>
        <Icon name={icon} className={ACCENT_ICON[accent]} />
      </div>
      {loading ? (
        <Skeleton className="h-8 w-28" />
      ) : (
        <div className="flex items-baseline gap-2">
          <h3 className="text-h2 font-semibold text-on-surface">{value}</h3>
          {trend && (
            <span
              className={cn(
                'text-[11px] font-bold',
                trend.positive === false ? 'text-error' : 'text-secondary',
              )}
            >
              {trend.value}
            </span>
          )}
        </div>
      )}
      {hint && !loading && (
        <p className="mt-1 font-mono-data text-[11px] text-outline">{hint}</p>
      )}
      {footer}
    </div>
  );
}
