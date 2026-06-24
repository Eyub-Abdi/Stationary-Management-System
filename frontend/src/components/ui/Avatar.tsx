import { cn, initials } from '@/lib/utils';

type Size = 'xs' | 'sm' | 'md' | 'lg';

const SIZES: Record<Size, string> = {
  xs: 'h-7 w-7 text-[11px]',
  sm: 'h-8 w-8 text-[12px]',
  md: 'h-10 w-10 text-[13px]',
  lg: 'h-14 w-14 text-h3',
};

// Deterministic, theme-aware color per name so avatars are colorful yet stable.
const PALETTE = [
  'bg-primary-fixed text-on-primary-fixed',
  'bg-secondary-container text-on-secondary-container',
  'bg-tertiary-fixed text-on-tertiary-fixed',
  'bg-primary-container text-on-primary-container',
  'bg-error-container text-on-error-container',
];

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export function Avatar({
  name,
  size = 'sm',
  className,
}: {
  name: string;
  size?: Size;
  className?: string;
}) {
  return (
    <span
      title={name}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold leading-none ring-1 ring-inset ring-black/5',
        SIZES[size],
        colorFor(name),
        className,
      )}
    >
      {initials(name) || '—'}
    </span>
  );
}
