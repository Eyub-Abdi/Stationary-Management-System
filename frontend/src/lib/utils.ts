import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';
import { format, formatDistanceToNow, parseISO } from 'date-fns';

// Our Tailwind theme renames the `text-*` scale (text-body-lg, text-h2, …) and
// adds Material-You color tokens (text-on-primary, bg-surface-container, …).
// Default tailwind-merge can't tell a custom font-size from a custom color, so
// it wrongly drops one when both appear (e.g. a button's color + size). Teach it
// our tokens so font-size and color are merged as separate concerns.
const FONT_SIZES = ['h1', 'h2', 'h3', 'body-lg', 'body-sm', 'label-caps', 'data-mono'];

const COLORS = [
  'on-background', 'surface-container', 'inverse-on-surface', 'surface-bright', 'secondary',
  'secondary-fixed', 'on-secondary', 'inverse-surface', 'tertiary-fixed-dim', 'error', 'on-error',
  'tertiary', 'tertiary-container', 'on-primary', 'on-surface', 'tertiary-fixed',
  'surface-container-lowest', 'surface', 'inverse-primary', 'secondary-fixed-dim', 'outline-variant',
  'primary-container', 'primary-fixed-dim', 'on-primary-container', 'on-secondary-container',
  'on-error-container', 'on-primary-fixed-variant', 'secondary-container', 'on-surface-variant',
  'on-tertiary', 'background', 'surface-variant', 'surface-container-highest', 'primary-fixed',
  'surface-dim', 'error-container', 'primary', 'on-secondary-fixed', 'on-tertiary-fixed-variant',
  'on-primary-fixed', 'surface-container-low', 'surface-tint', 'outline', 'on-tertiary-container',
  'surface-container-high', 'on-secondary-fixed-variant', 'on-tertiary-fixed',
];

const twMerge = extendTailwindMerge({
  extend: {
    theme: { colors: COLORS },
    classGroups: {
      'font-size': [{ text: FONT_SIZES }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const CURRENCY = (import.meta.env.VITE_CURRENCY as string) ?? 'TZS';

/** Format a Decimal-string or number as the configured currency (TZS default). */
export function money(value: string | number | null | undefined, opts?: { decimals?: boolean }): string {
  const n = typeof value === 'string' ? parseFloat(value) : value ?? 0;
  const safe = Number.isFinite(n) ? n : 0;
  const decimals = opts?.decimals ?? false;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  }).format(safe);
}

/** Currency with the ISO code prefix, e.g. "TZS 12,500". */
export function currency(value: string | number | null | undefined, opts?: { decimals?: boolean }): string {
  return `${CURRENCY} ${money(value, opts)}`;
}

export function num(value: string | number | null | undefined): number {
  const n = typeof value === 'string' ? parseFloat(value) : value ?? 0;
  return Number.isFinite(n) ? n : 0;
}

export function compactNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function toDate(value: string | Date): Date {
  return typeof value === 'string' ? parseISO(value) : value;
}

export function formatDate(value: string | Date | null | undefined, fmt = 'dd MMM yyyy'): string {
  if (!value) return '—';
  try {
    return format(toDate(value), fmt);
  } catch {
    return '—';
  }
}

export function formatDateTime(value: string | Date | null | undefined): string {
  return formatDate(value, 'dd MMM yyyy, HH:mm');
}

export function timeAgo(value: string | Date | null | undefined): string {
  if (!value) return '—';
  try {
    return formatDistanceToNow(toDate(value), { addSuffix: true });
  } catch {
    return '—';
  }
}

/** ISO datetime string for the start of today (local). */
export function startOfToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function endOfToday(): string {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

export function startOfMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

export function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/** Resolve an uploaded image path (e.g. /uploads/products/x.png) to a URL. */
// Origin that serves uploaded files. Uploads are exposed at the API host root
// (e.g. https://api.example.com/uploads/...), NOT under the /api/v1 path. When
// the API base is absolute we reuse its origin; when it's relative (dev proxy or
// same-origin reverse proxy) we keep paths relative. An explicit
// VITE_UPLOADS_BASE_URL overrides both.
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) ?? '/api/v1';
const UPLOADS_BASE = (
  import.meta.env.VITE_UPLOADS_BASE_URL ??
  (/^https?:\/\//.test(API_BASE) ? new URL(API_BASE).origin : '')
).replace(/\/+$/, '');

export function imageSrc(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  const rel = path.startsWith('/') ? path : `/${path}`;
  return `${UPLOADS_BASE}${rel}`;
}

/** Human label for a SCREAMING_SNAKE enum value. */
export function humanize(value: string): string {
  return value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
