import { cn } from '@/lib/utils';
import { Icon } from './Icon';
import { Spinner } from './Spinner';
import { Button } from './Button';

export function EmptyState({
  icon = 'inbox',
  title,
  description,
  action,
  className,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-16 text-center', className)}>
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-container text-on-surface-variant">
        <Icon name={icon} size={32} />
      </div>
      <h3 className="text-h3 font-semibold text-on-surface">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-body-sm text-on-surface-variant">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-16 text-on-surface-variant', className)}>
      <Spinner size={28} className="text-secondary" />
      <p className="text-body-sm">{label}</p>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-16 text-center', className)}>
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-error-container text-error">
        <Icon name="error" size={32} />
      </div>
      <h3 className="text-h3 font-semibold text-on-surface">Unable to load data</h3>
      <p className="mt-1 max-w-sm text-body-sm text-on-surface-variant">
        {message ?? 'An unexpected error occurred while fetching this resource.'}
      </p>
      {onRetry && (
        <Button variant="outline" icon="refresh" className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** Skeleton shimmer block. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-surface-container', className)} />;
}
