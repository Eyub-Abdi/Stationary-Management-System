import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { Icon } from './Icon';

type Size = 'sm' | 'md' | 'lg' | 'xl';

const SIZES: Record<Size, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  size = 'md',
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  size?: Size;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div
        className="animate-fade-in fixed inset-0 bg-on-background/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'animate-scale-in relative z-10 my-auto w-full rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-2xl',
          SIZES[size],
        )}
      >
        {title || subtitle ? (
          <div className="flex items-start justify-between gap-4 border-b border-outline-variant px-6 py-4">
            <div className="min-w-0">
              {title && <h3 className="text-h3 font-semibold text-on-surface">{title}</h3>}
              {subtitle && (
                <p className="mt-0.5 text-body-sm text-on-surface-variant">{subtitle}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="-mr-2 -mt-1 rounded-full p-2 text-on-surface-variant hover:bg-surface-container"
              aria-label="Close"
            >
              <Icon name="close" size={20} />
            </button>
          </div>
        ) : (
          // Headerless modals (e.g. receipts) still need a visible close affordance.
          <button
            onClick={onClose}
            className="absolute right-3 top-3 z-10 rounded-full bg-surface-container p-2 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
            aria-label="Close"
          >
            <Icon name="close" size={20} />
          </button>
        )}
        <div className="px-6 py-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-3 border-t border-outline-variant bg-surface-container-low px-6 py-4 rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
