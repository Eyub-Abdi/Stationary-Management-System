import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number }>({ top: 0 });

  // Position the menu in a body-level portal using fixed coordinates derived
  // from the trigger, so it can't be clipped by a table's overflow container.
  const place = () => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const menuH = menuRef.current?.offsetHeight ?? 0;
    const below = r.bottom + 4;
    // Flip above the trigger when there isn't room below.
    const openUp = menuH > 0 && below + menuH > window.innerHeight && r.top - menuH - 4 > 0;
    const top = openUp ? r.top - menuH - 4 : below;
    setPos(
      align === 'right'
        ? { top, right: window.innerWidth - r.right }
        : { top, left: r.left },
    );
  };

  useLayoutEffect(() => {
    if (open) place();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const reposition = () => place();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    // Capture phase so inner (table) scrolls also reposition the menu.
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      document.removeEventListener('mousedown', onDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div ref={triggerRef} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="rounded-lg p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container"
        aria-label="Actions"
      >
        {trigger ?? <Icon name="more_vert" size={20} />}
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left, right: pos.right }}
            className={cn(
              'animate-scale-in z-[60] min-w-[180px] overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest py-1 shadow-xl',
            )}
          >
            {actions.map((a, i) => (
              <button
                key={i}
                type="button"
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
          </div>,
          document.body,
        )}
    </div>
  );
}
