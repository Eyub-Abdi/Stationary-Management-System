import { cn } from '@/lib/utils';

interface IconProps {
  name: string;
  className?: string;
  filled?: boolean;
  /** Optical size in px (drives font-size too). */
  size?: number;
  style?: React.CSSProperties;
  title?: string;
}

export function Icon({ name, className, filled, size, style, title }: IconProps) {
  return (
    <span
      className={cn('material-symbols-outlined', className)}
      title={title}
      aria-hidden={title ? undefined : true}
      style={{
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 24`,
        fontSize: size ? `${size}px` : undefined,
        ...style,
      }}
    >
      {name}
    </span>
  );
}
