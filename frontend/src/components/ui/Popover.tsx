import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(n, hi));

/**
 * A lightweight popover anchored to an element — floats just below (or above,
 * if it would overflow) the anchor. Closes on outside click, Escape, scroll or
 * resize. Preferred over a Modal for quick, in-context choices (e.g. POS
 * variant picking) where a full overlay would be too heavy.
 */
export function Popover({
  anchor,
  open,
  onClose,
  children,
  width = 260,
  className,
}: {
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });

  useLayoutEffect(() => {
    if (!open || !anchor || !ref.current) return;
    const r = anchor.getBoundingClientRect();
    const h = ref.current.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = clamp(r.left + r.width / 2 - width / 2, 8, vw - width - 8);
    let top = r.bottom + 8;
    if (top + h > vh - 8) {
      const above = r.top - 8 - h;
      top = above >= 8 ? above : clamp(top, 8, vh - h - 8);
    }
    setStyle({ position: 'fixed', top, left, width, visibility: 'visible' });
  }, [open, anchor, width]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const close = () => onClose();
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80]" onClick={onClose}>
      <div
        ref={ref}
        style={style}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          // Elevated tone + strong shadow/ring so it clearly floats above the
          // product tiles (which sit on surface-container-lowest).
          'rounded-xl border border-outline bg-surface-container-high p-2 shadow-2xl ring-1 ring-black/10 dark:ring-white/10',
          className,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
