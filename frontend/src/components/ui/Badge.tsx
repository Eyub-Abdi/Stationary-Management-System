import { cn } from '@/lib/utils';

type Tone = 'neutral' | 'success' | 'error' | 'warning' | 'info' | 'navy';

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-container-high text-on-surface-variant',
  success: 'bg-secondary-container text-on-secondary-container',
  error: 'bg-error-container text-on-error-container',
  warning: 'bg-tertiary-fixed text-on-tertiary-fixed',
  info: 'bg-primary-fixed text-on-primary-fixed',
  navy: 'bg-primary-container text-on-primary-container',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
  dot,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold leading-5',
        TONES[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
