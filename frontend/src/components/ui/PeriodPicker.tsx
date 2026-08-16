import { useEffect, useRef, useState } from 'react';
import {
  MONTH_ABBR,
  FIRST_YEAR,
  resolvePeriod,
  type Period,
  type PeriodKind,
} from '@/lib/period';
import { cn } from '@/lib/utils';
import { Icon } from './Icon';
import { Input } from './Field';

const PRESETS: { value: PeriodKind; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'thisMonth', label: 'This month' },
  { value: 'all', label: 'All time' },
];

/**
 * Period selection for the reporting pages.
 *
 * The months are laid out as a year at a time rather than hidden in a dropdown,
 * because choosing a month is a spatial act — you scan for June, you don't read
 * a list to find it. Stepping the year keeps a whole year's worth of choices on
 * screen at once, and the year heading is itself the button for the whole year.
 */
export function PeriodPicker({
  value,
  onChange,
  className,
}: {
  value: Period;
  onChange: (p: Period) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const now = new Date();
  const thisYear = now.getFullYear();

  // The year the grid is showing, which is not necessarily the selected one —
  // you can look at 2026 while June 2027 stays chosen until you click.
  const [viewYear, setViewYear] = useState(value.year ?? thisYear);

  useEffect(() => {
    if (open) setViewYear(value.year ?? thisYear);
  }, [open, value.year, thisYear]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const label = resolvePeriod(value).label;
  const pick = (p: Period) => {
    onChange(p);
    setOpen(false);
  };

  const monthSelected = (m: number) =>
    value.kind === 'month' && value.year === viewYear && value.month === m;
  // Months that have not happened yet hold nothing to report on.
  const monthAhead = (m: number) =>
    viewYear > thisYear || (viewYear === thisYear && m > now.getMonth());

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex h-11 min-w-[13rem] items-center justify-between gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest px-3.5 text-body-sm text-on-surface outline-none transition-colors hover:bg-surface-container focus-visible:ring-2 focus-visible:ring-secondary/30"
      >
        <span className="flex items-center gap-2 truncate">
          <Icon name="calendar_month" size={18} className="shrink-0 text-on-surface-variant" />
          <span className="truncate font-medium">{label}</span>
        </span>
        <Icon name="expand_more" size={20} className="shrink-0 text-on-surface-variant" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose a period"
          className="absolute right-0 z-40 mt-1 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-outline-variant bg-surface-container-high p-3 shadow-2xl ring-1 ring-black/5 dark:ring-white/10"
        >
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => pick({ kind: p.value })}
                className={cn(
                  'rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors',
                  value.kind === p.value
                    ? 'bg-primary-container text-on-primary-container'
                    : 'text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="my-3 h-px bg-outline-variant" />

          {/* Year stepper. The heading doubles as "the whole of this year". */}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label="Previous year"
              disabled={viewYear <= FIRST_YEAR}
              onClick={() => setViewYear((y) => y - 1)}
              className="grid h-8 w-8 place-items-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-highest hover:text-on-surface disabled:pointer-events-none disabled:opacity-30"
            >
              <Icon name="chevron_left" size={20} />
            </button>
            <button
              type="button"
              onClick={() => pick({ kind: 'year', year: viewYear })}
              title={`Report on the whole of ${viewYear}`}
              className={cn(
                'rounded-lg px-3 py-1 text-body-sm font-bold tabular-nums transition-colors',
                value.kind === 'year' && value.year === viewYear
                  ? 'bg-primary-container text-on-primary-container'
                  : 'text-on-surface hover:bg-surface-container-highest',
              )}
            >
              {viewYear}
            </button>
            <button
              type="button"
              aria-label="Next year"
              disabled={viewYear >= thisYear}
              onClick={() => setViewYear((y) => y + 1)}
              className="grid h-8 w-8 place-items-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-highest hover:text-on-surface disabled:pointer-events-none disabled:opacity-30"
            >
              <Icon name="chevron_right" size={20} />
            </button>
          </div>

          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {MONTH_ABBR.map((m, i) => (
              <button
                key={m}
                type="button"
                disabled={monthAhead(i)}
                onClick={() => pick({ kind: 'month', year: viewYear, month: i })}
                className={cn(
                  'rounded-lg py-2 text-[13px] font-medium transition-colors',
                  monthSelected(i)
                    ? 'bg-primary text-on-primary'
                    : 'text-on-surface hover:bg-surface-container-highest',
                  monthAhead(i) && 'pointer-events-none text-outline opacity-40',
                )}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="my-3 h-px bg-outline-variant" />

          <div className="flex items-center gap-2">
            <Input
              type="date"
              aria-label="From date"
              value={value.kind === 'custom' ? value.from ?? '' : ''}
              max={value.to || undefined}
              onChange={(e) =>
                onChange({ ...value, kind: 'custom', from: e.target.value })
              }
              className="h-10 flex-1"
            />
            <span className="text-[13px] text-on-surface-variant">to</span>
            <Input
              type="date"
              aria-label="To date"
              value={value.kind === 'custom' ? value.to ?? '' : ''}
              min={value.from || undefined}
              onChange={(e) => onChange({ ...value, kind: 'custom', to: e.target.value })}
              className="h-10 flex-1"
            />
          </div>
        </div>
      )}
    </div>
  );
}
