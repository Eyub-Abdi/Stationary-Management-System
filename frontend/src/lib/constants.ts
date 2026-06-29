import type {
  ExpenseCategory,
  PricingType,
  Role,
} from '@/types';

/** Icon used for all services in the UI (services no longer carry their own). */
export const DEFAULT_SERVICE_ICON = 'design_services';

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
  { value: 'OFFICE_SUPPLIES', label: 'Office / Internal Use', icon: 'business_center' },
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
