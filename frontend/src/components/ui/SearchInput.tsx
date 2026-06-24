import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { cn } from '@/lib/utils';

/** Debounced search field. Calls onChange after the user stops typing. */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className,
  delay = 350,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  delay?: number;
}) {
  const [local, setLocal] = useState(value);

  useEffect(() => setLocal(value), [value]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (local !== value) onChange(local);
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local]);

  return (
    <div className={cn('relative', className)}>
      <Icon
        name="search"
        size={20}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
      />
      <input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border border-outline-variant bg-surface-container-lowest pl-10 pr-9 text-body-sm text-on-surface outline-none transition-all placeholder:text-on-surface-variant/60 focus:border-secondary focus:ring-2 focus:ring-secondary/30"
      />
      {local && (
        <button
          onClick={() => {
            setLocal('');
            onChange('');
          }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-on-surface-variant hover:bg-surface-container"
          aria-label="Clear"
        >
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  );
}
