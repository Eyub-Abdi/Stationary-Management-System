import type { PricingType, Role } from '@/types';

/** Icon used for all services in the UI (services no longer carry their own). */
export const DEFAULT_SERVICE_ICON = 'design_services';

export const PRICING_TYPE_OPTIONS: { value: PricingType; label: string }[] = [
  { value: 'PER_PAGE', label: 'Per Page' },
  { value: 'FIXED', label: 'Fixed Price' },
];

/** Fallback when a category has no icon set. */
export const DEFAULT_EXPENSE_ICON = 'category';

// Icons an admin can pick from when creating an expense category. These are
// Material Symbols names — the same set the rest of the UI draws from.
export const EXPENSE_ICON_OPTIONS = [
  'category',
  'home_work',
  'badge',
  'bolt',
  'wifi',
  'opacity',
  'description',
  'local_shipping',
  'restaurant',
  'business_center',
  'water_drop',
  'local_gas_station',
  'build',
  'cleaning_services',
  'shopping_cart',
  'phone_iphone',
  'health_and_safety',
  'school',
  'campaign',
  'gavel',
  'savings',
  'receipt_long',
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
