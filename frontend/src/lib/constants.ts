import type { PricingType, Role, StockAdjustmentReason } from '@/types';

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

// ---- Stock adjustment reasons ---------------------------------------------

/** Display name and icon per adjustment reason. Mirrors the server's labels. */
export const ADJUSTMENT_REASONS: Record<
  StockAdjustmentReason,
  { label: string; icon: string }
> = {
  JAM: { label: 'Printer jam / misprint', icon: 'print_disabled' },
  SPOILED: { label: 'Spoiled in handling', icon: 'water_drop' },
  DAMAGED: { label: 'Damaged goods', icon: 'broken_image' },
  EXPIRED: { label: 'Expired', icon: 'schedule' },
  LOST: { label: 'Lost / missing', icon: 'help' },
  THEFT: { label: 'Theft', icon: 'lock_open' },
  COUNT_CORRECTION: { label: 'Stock count correction', icon: 'fact_check' },
  FOUND: { label: 'Stock found', icon: 'add_box' },
  OTHER: { label: 'Other', icon: 'more_horiz' },
};

/** Offered when stock is going out — a loss or a downward recount. */
export const STOCK_OUT_REASONS: StockAdjustmentReason[] = [
  'JAM',
  'SPOILED',
  'DAMAGED',
  'EXPIRED',
  'LOST',
  'THEFT',
  'COUNT_CORRECTION',
  'OTHER',
];

/** Offered when stock is coming back on. */
export const STOCK_IN_REASONS: StockAdjustmentReason[] = [
  'FOUND',
  'COUNT_CORRECTION',
  'OTHER',
];

/** What a cashier may record from the POS. Kept in step with the API, which
 *  rejects anything wider from that endpoint. */
export const POS_WASTAGE_REASONS: StockAdjustmentReason[] = [
  'JAM',
  'SPOILED',
  'DAMAGED',
];
