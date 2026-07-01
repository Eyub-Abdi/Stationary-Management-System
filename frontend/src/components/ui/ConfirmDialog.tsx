import { Modal } from './Modal';
import { Button } from './Button';
import { Icon } from './Icon';
import { cn } from '@/lib/utils';

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  loading,
  icon = 'help',
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
  icon?: string;
}) {
  return (
    <Modal open={open} onClose={onClose} size="sm">
      <div className="flex flex-col items-center text-center">
        <div
          className={cn(
            'mb-4 flex h-14 w-14 items-center justify-center rounded-full',
            tone === 'danger' ? 'bg-error-container text-error' : 'bg-primary-fixed text-primary',
          )}
        >
          <Icon name={icon} size={28} />
        </div>
        <h3 className="text-h3 font-semibold text-on-surface">{title}</h3>
        <p className="mt-1.5 text-body-sm text-on-surface-variant">{message}</p>
        <div className="mt-6 grid w-full grid-cols-2 gap-3">
          <Button variant="outline" fullWidth onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            fullWidth
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
