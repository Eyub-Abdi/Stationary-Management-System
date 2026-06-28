import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { Icon } from './Icon';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'subtle';
type Size = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: string;
  iconRight?: string;
  fullWidth?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-primary text-on-primary hover:opacity-90 shadow-sm disabled:opacity-50',
  secondary:
    'bg-secondary text-on-secondary hover:opacity-90 shadow-sm disabled:opacity-50',
  outline:
    'bg-surface-container-lowest border border-outline text-on-surface hover:bg-surface-container-low disabled:opacity-50',
  ghost:
    'text-on-surface-variant hover:bg-surface-container hover:text-on-surface disabled:opacity-50',
  subtle:
    'bg-surface-container text-on-surface hover:bg-surface-container-high disabled:opacity-50',
  danger:
    'bg-error text-on-error hover:opacity-90 shadow-sm disabled:opacity-50',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-[13px] gap-1.5',
  md: 'h-10 px-5 text-body-sm gap-2',
  lg: 'h-12 px-6 text-body-lg gap-2',
  icon: 'h-10 w-10 justify-center',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = 'primary', size = 'md', loading, icon, iconRight, fullWidth, className, children, disabled, ...props },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-xl font-semibold transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-1 focus-visible:ring-offset-background active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100',
          VARIANTS[variant],
          SIZES[size],
          fullWidth && 'w-full',
          className,
        )}
        {...props}
      >
        {loading ? (
          <Spinner size={18} />
        ) : (
          icon && <Icon name={icon} size={size === 'sm' ? 18 : 20} />
        )}
        {children}
        {iconRight && !loading && <Icon name={iconRight} size={size === 'sm' ? 18 : 20} />}
      </button>
    );
  },
);
Button.displayName = 'Button';
