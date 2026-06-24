import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { Icon } from './Icon';

export function Label({
  children,
  htmlFor,
  required,
  className,
}: {
  children: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn(
        'mb-1.5 block text-label-caps font-semibold uppercase tracking-wide text-on-surface-variant',
        className,
      )}
    >
      {children}
      {required && <span className="ml-0.5 text-error">*</span>}
    </label>
  );
}

export function Field({
  label,
  htmlFor,
  required,
  error,
  hint,
  children,
  className,
}: {
  label?: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('w-full', className)}>
      {label && (
        <Label htmlFor={htmlFor} required={required}>
          {label}
        </Label>
      )}
      {children}
      {error ? (
        <p className="mt-1 flex items-center gap-1 text-[12px] font-medium text-error">
          <Icon name="error" size={14} /> {error}
        </p>
      ) : (
        hint && <p className="mt-1 text-[12px] text-on-surface-variant">{hint}</p>
      )}
    </div>
  );
}

const baseControl =
  'w-full rounded-xl border bg-surface-container-lowest text-body-sm text-on-surface outline-none transition-all placeholder:text-on-surface-variant/60 disabled:cursor-not-allowed disabled:bg-surface-container-low disabled:opacity-60 focus:ring-2 focus:ring-secondary/30 focus:border-secondary';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  leftIcon?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, leftIcon, ...props }, ref) => {
    if (leftIcon) {
      return (
        <div className="relative">
          <Icon
            name={leftIcon}
            size={20}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
          />
          <input
            ref={ref}
            className={cn(
              baseControl,
              'h-11 pl-10 pr-3',
              invalid && 'border-error focus:border-error focus:ring-error/30',
              !invalid && 'border-outline-variant',
              className,
            )}
            {...props}
          />
        </div>
      );
    }
    return (
      <input
        ref={ref}
        className={cn(
          baseControl,
          'h-11 px-3.5',
          invalid ? 'border-error focus:border-error focus:ring-error/30' : 'border-outline-variant',
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  ({ className, invalid, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        baseControl,
        'min-h-[88px] px-3.5 py-2.5',
        invalid ? 'border-error focus:border-error focus:ring-error/30' : 'border-outline-variant',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, invalid, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          baseControl,
          'h-11 appearance-none px-3.5 pr-10',
          invalid ? 'border-error focus:border-error focus:ring-error/30' : 'border-outline-variant',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <Icon
        name="expand_more"
        size={20}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
      />
    </div>
  ),
);
Select.displayName = 'Select';

export function Checkbox({
  label,
  className,
  id,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: React.ReactNode }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer select-none items-center gap-2.5">
      <input
        id={id}
        type="checkbox"
        className={cn(
          'h-[18px] w-[18px] rounded-md border-outline-variant text-secondary focus:ring-secondary/40',
          className,
        )}
        {...props}
      />
      {label && <span className="text-body-sm text-on-surface-variant">{label}</span>}
    </label>
  );
}
