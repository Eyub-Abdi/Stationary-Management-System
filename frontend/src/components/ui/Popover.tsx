import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(n, hi));

/** Breathing room kept between the popover and the edges of the screen. */
const EDGE = 8;

/**
 * A lightweight popover anchored to an element — floats just below (or above,
 * if it would overflow) the anchor. Closes on outside click, Escape, scroll or
 * resize. Preferred over a Modal for quick, in-context choices (e.g. POS
 * variant picking) where a full overlay would be too heavy.
 *
 * Content taller than the space available scrolls inside the popover instead of
 * running off the bottom of the screen, so the last item is always reachable.
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
  const bodyRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });

  useLayoutEffect(() => {
    if (!open || !anchor || !ref.current || !bodyRef.current) return;
    const r = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Natural height of the content (scrollHeight ignores any cap we've already
    // applied), plus the popover's own padding and border.
    const chrome = ref.current.offsetHeight - bodyRef.current.clientHeight;
    const h = bodyRef.current.scrollHeight + chrome;

    // A wide popover on a narrow screen shrinks rather than hanging off-screen.
    const w = Math.min(width, vw - EDGE * 2);
    const left = clamp(r.left + r.width / 2 - w / 2, EDGE, Math.max(EDGE, vw - w - EDGE));

    const below = vh - r.bottom - EDGE * 2;
    const above = r.top - EDGE * 2;
    let top: number;
    let maxHeight: number;
    if (h <= below || below >= above) {
      // Fits underneath, or underneath is simply the roomier side.
      top = r.bottom + EDGE;
      maxHeight = below;
    } else {
      // Sit above the anchor, bottom-aligned to it.
      maxHeight = above;
      top = r.top - EDGE - Math.min(h, above);
    }

    setStyle({ position: 'fixed', top, left, width: w, maxHeight, visibility: 'visible' });
  }, [open, anchor, width]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const close = (e: Event) => {
      // Scrolling the popover's own list must not dismiss it.
      if (e.target instanceof Node && ref.current?.contains(e.target)) return;
      onClose();
    };
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
          'flex flex-col overflow-hidden rounded-xl border border-outline bg-surface-container-high p-2 shadow-2xl ring-1 ring-black/10 dark:ring-white/10',
          className,
        )}
      >
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
