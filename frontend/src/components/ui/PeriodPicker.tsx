import { MONTH_NAMES, yearOptions, type Period, type PeriodKind } from '@/lib/period';
import { cn } from '@/lib/utils';
import { Input, Select } from './Field';

const KINDS: { value: PeriodKind; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'thisMonth', label: 'This month' },
  { value: 'thisYear', label: 'This year' },
  { value: 'month', label: 'A specific month…' },
  { value: 'year', label: 'A specific year…' },
  { value: 'custom', label: 'Custom dates…' },
  { value: 'all', label: 'All time' },
];

/**
 * Period selection for the reporting pages.
 *
 * One control decides the shape, and only the fields that shape needs appear
 * beside it — picking a month should not leave two empty date boxes sitting
 * there implying they matter.
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
  const now = new Date();
  const years = yearOptions();
  const set = (patch: Partial<Period>) => onChange({ ...value, ...patch });

  return (
    <div className={cn('flex flex-col gap-2 sm:flex-row sm:items-center', className)}>
      <Select
        value={value.kind}
        aria-label="Reporting period"
        onChange={(e) => {
          const kind = e.target.value as PeriodKind;
          // Seed the pickers with the current month/year so the first choice
          // already means something.
          onChange({
            kind,
            month: value.month ?? now.getMonth(),
            year: value.year ?? now.getFullYear(),
            from: value.from,
            to: value.to,
          });
        }}
        className="sm:w-48"
      >
        {KINDS.map((k) => (
          <option key={k.value} value={k.value}>
            {k.label}
          </option>
        ))}
      </Select>

      {value.kind === 'month' && (
        <div className="flex gap-2">
          <Select
            value={String(value.month ?? now.getMonth())}
            aria-label="Month"
            onChange={(e) => set({ month: Number(e.target.value) })}
            className="w-36"
          >
            {MONTH_NAMES.map((m, i) => (
              <option key={m} value={i}>
                {m}
              </option>
            ))}
          </Select>
          <Select
            value={String(value.year ?? now.getFullYear())}
            aria-label="Year"
            onChange={(e) => set({ year: Number(e.target.value) })}
            className="w-28"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>
      )}

      {value.kind === 'year' && (
        <Select
          value={String(value.year ?? now.getFullYear())}
          aria-label="Year"
          onChange={(e) => set({ year: Number(e.target.value) })}
          className="w-28"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
      )}

      {value.kind === 'custom' && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={value.from ?? ''}
            aria-label="From date"
            max={value.to || undefined}
            onChange={(e) => set({ from: e.target.value })}
            className="w-40"
          />
          <span className="text-body-sm text-on-surface-variant">to</span>
          <Input
            type="date"
            value={value.to ?? ''}
            aria-label="To date"
            min={value.from || undefined}
            onChange={(e) => set({ to: e.target.value })}
            className="w-40"
          />
        </div>
      )}
    </div>
  );
}
