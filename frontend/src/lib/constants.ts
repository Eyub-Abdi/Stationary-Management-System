import type {
  ExpenseCategory,
  PricingType,
  Role,
  ServiceType,
} from '@/types';

export const SERVICE_TYPE_OPTIONS: { value: ServiceType; label: string; icon: string }[] = [
  { value: 'PRINTING_BW', label: 'Printing — Black & White', icon: 'print' },
  { value: 'PRINTING_COLOR', label: 'Printing — Color', icon: 'print' },
  { value: 'PHOTOCOPY_BW', label: 'Photocopy — Black & White', icon: 'content_copy' },
  { value: 'PHOTOCOPY_COLOR', label: 'Photocopy — Color', icon: 'content_copy' },
  { value: 'SCANNING', label: 'Scanning', icon: 'scanner' },
  { value: 'LAMINATION', label: 'Lamination', icon: 'note_stack' },
  { value: 'TYPING', label: 'Typing', icon: 'keyboard' },
];

export const SERVICE_TYPE_ICON: Record<ServiceType, string> = {
  PRINTING_BW: 'print',
  PRINTING_COLOR: 'print',
  PHOTOCOPY_BW: 'content_copy',
  PHOTOCOPY_COLOR: 'content_copy',
  SCANNING: 'scanner',
  LAMINATION: 'note_stack',
  TYPING: 'keyboard',
};

export const PRICING_TYPE_OPTIONS: { value: PricingType; label: string }[] = [
  { value: 'PER_PAGE', label: 'Per Page' },
  { value: 'FIXED', label: 'Fixed Price' },
];

export const EXPENSE_CATEGORY_OPTIONS: { value: ExpenseCategory; label: string; icon: string }[] = [
  { value: 'RENT', label: 'Rent', icon: 'home_work' },
  { value: 'SALARY', label: 'Salary', icon: 'badge' },
  { value: 'ELECTRICITY', label: 'Electricity', icon: 'bolt' },
  { value: 'INTERNET', label: 'Internet', icon: 'wifi' },
  { value: 'TONER', label: 'Toner', icon: 'opacity' },
  { value: 'PAPER', label: 'Paper', icon: 'description' },
  { value: 'TRANSPORT', label: 'Transport', icon: 'local_shipping' },
  { value: 'MISCELLANEOUS', label: 'Miscellaneous', icon: 'category' },
];

export const EXPENSE_CATEGORY_ICON: Record<ExpenseCategory, string> = Object.fromEntries(
  EXPENSE_CATEGORY_OPTIONS.map((o) => [o.value, o.icon]),
) as Record<ExpenseCategory, string>;

// Categories staff may record/see ("petty cash"). Fixed overheads (rent, salary,
// electricity, internet) are management-only. Keep in sync with the backend.
export const PETTY_CASH_CATEGORIES: ExpenseCategory[] = [
  'TONER',
  'PAPER',
  'TRANSPORT',
  'MISCELLANEOUS',
];

export const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'STAFF', label: 'Staff' },
  { value: 'ADMIN', label: 'Administrator' },
];

// Cohesive data-viz palette: vivid mid-tones that stay legible on both light
// and dark surfaces (no near-black/near-white), anchored on the brand
// blue/teal with warm accents. Index 0 is the primary series color.
export const CHART_COLORS = [
  '#4263eb', // indigo blue — primary series
  '#12b886', // teal green — brand secondary family
  '#f59f00', // amber
  '#7048e8', // violet
  '#15aabf', // cyan
  '#e8590c', // orange
  '#e64980', // pink
  '#4cb944', // green
];
