import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Icon } from './Icon';

export interface MenuAction {
  label: string;
  icon?: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/** Lightweight popover menu, typically triggered by a "more_vert" button. */
export function Dropdown({
  actions,
  trigger,
  align = 'right',
}: {
  actions: MenuAction[];
  trigger?: React.ReactNode;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="rounded-lg p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container"
        aria-label="Actions"
      >
        {trigger ?? <Icon name="more_vert" size={20} />}
      </button>
      {open && (
        <div
          className={cn(
            'animate-scale-in absolute z-50 mt-1 min-w-[180px] overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest py-1 shadow-xl',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {actions.map((a, i) => (
            <button
              key={i}
              disabled={a.disabled}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                a.onClick();
              }}
              className={cn(
                'flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-body-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                a.danger
                  ? 'text-error hover:bg-error-container/40'
                  : 'text-on-surface hover:bg-surface-container-low',
              )}
            >
              {a.icon && <Icon name={a.icon} size={18} />}
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
