import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Icon } from './Icon';

export interface ComboOption {
  value: string;
  label: string;
}

const control =
  'w-full h-11 rounded-xl border bg-surface-container-lowest px-3.5 pr-10 text-body-sm text-on-surface outline-none transition-all placeholder:text-on-surface-variant/60 focus:ring-2 focus:ring-secondary/30 focus:border-secondary';

/**
 * A type-to-search dropdown (combobox). Behaves like a Select but lets the user
 * filter options by typing any part of the label — handy for long lists such as
 * products/variants where a native select only jumps by first letter.
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  invalid,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: ComboOption[];
  placeholder?: string;
  invalid?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = options.find((o) => o.value === value) ?? null;
  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={ref} className={cn('relative', className)}>
      <input
        type="text"
        value={open ? query : selected?.label ?? ''}
        placeholder={selected ? selected.label : placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false);
            setQuery('');
          } else if (e.key === 'Enter' && open && filtered.length > 0) {
            e.preventDefault();
            pick(filtered[0].value);
          }
        }}
        className={cn(control, invalid ? 'border-error focus:border-error focus:ring-error/30' : 'border-outline-variant')}
      />
      <Icon
        name={open ? 'search' : 'expand_more'}
        size={20}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
      />

      {open && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-outline-variant bg-surface-container-high p-1 shadow-2xl ring-1 ring-black/5 dark:ring-white/10">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-body-sm text-on-surface-variant">No matches</li>
          ) : (
            filtered.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(o.value)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-body-sm transition-colors hover:bg-surface-container-highest',
                    o.value === value ? 'font-semibold text-primary' : 'text-on-surface',
                  )}
                >
                  <span className="truncate">{o.label}</span>
                  {o.value === value && <Icon name="check" size={16} className="shrink-0 text-primary" />}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
