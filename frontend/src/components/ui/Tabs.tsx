import { cn } from '@/lib/utils';
import { Icon } from './Icon';

export interface TabItem<T extends string = string> {
  value: T;
  label: string;
  icon?: string;
  count?: number;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex gap-1 overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-low p-1 scrollbar-none', className)}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            onClick={() => onChange(item.value)}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-body-sm font-semibold transition-all',
              active
                ? 'bg-surface-container-lowest text-on-surface shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface',
            )}
          >
            {item.icon && <Icon name={item.icon} size={18} />}
            {item.label}
            {item.count != null && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                  active ? 'bg-primary-fixed text-on-primary-fixed' : 'bg-surface-container-high text-on-surface-variant',
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Segmented control variant used for compact filters. */
export function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
}: {
  items: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-outline-variant bg-surface-container-low p-0.5">
      {items.map((item) => (
        <button
          key={item.value}
          onClick={() => onChange(item.value)}
          className={cn(
            'rounded-md px-3 py-1.5 text-[13px] font-semibold transition-all',
            item.value === value
              ? 'bg-surface-container-lowest text-on-surface shadow-sm'
              : 'text-on-surface-variant hover:text-on-surface',
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
