import type { Role } from '@/types';
import type { PermissionKey } from '@/providers/AuthProvider';

/** Screens an admin can switch off in Settings, for the stretch they are used. */
export type FeatureKey = 'openingStock';

export type NavFeatures = Record<FeatureKey, boolean>;

export interface NavItem {
  to: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
  /** Visible to admins, or to staff granted this permission. */
  permission?: PermissionKey;
  // Alternate label shown to non-admin staff (e.g. "Expenses" → "Petty Cash").
  staffLabel?: string;
  /** Hidden entirely while the matching setting is off. */
  feature?: FeatureKey;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: 'dashboard' },
  { to: '/pos', label: 'Point of Sale', icon: 'point_of_sale' },
  { to: '/sales', label: 'Sales', icon: 'receipt_long' },
  { to: '/customers', label: 'Customers', icon: 'group' },
  { to: '/products', label: 'Products', icon: 'inventory_2' },
  { to: '/services', label: 'Services', icon: 'print' },
  { to: '/inventory', label: 'Inventory', icon: 'package_2' },
  // Setup, not trading: the shelf the shop started with. Sits next to
  // Inventory because that is where someone goes looking for it, and only
  // while an admin has it switched on — a shop enters this once.
  { to: '/opening-stock', label: 'Opening Stock', icon: 'flag', permission: 'inventory', feature: 'openingStock' },
  { to: '/purchases', label: 'Purchases', icon: 'shopping_cart', permission: 'purchases' },
  { to: '/suppliers', label: 'Suppliers', icon: 'local_shipping', permission: 'suppliers' },
  { to: '/expenses', label: 'Expenses', icon: 'payments', staffLabel: 'Petty Cash' },
  { to: '/office-purchases', label: 'Office Purchases', icon: 'business_center', permission: 'officePurchases' },
  // Three money entries sit together, so each needs a silhouette of its own:
  // the drawer, the bank building, the handshake.
  { to: '/cash', label: 'Cash Management', icon: 'local_atm' },
  { to: '/bank', label: 'Bank', icon: 'account_balance', adminOnly: true },
  // Staff see this too, but the API shows them only their own loans.
  { to: '/loans', label: 'Member Loans', icon: 'handshake', staffLabel: 'My Loans' },
  { to: '/reports', label: 'Reports', icon: 'assessment', permission: 'reports' },
  { to: '/profit', label: 'Profit Analysis', icon: 'trending_up', permission: 'reports' },
  { to: '/movement', label: 'Product Movement', icon: 'insights', permission: 'reports' },
  // Distinct from Customers' `group`: collapsed, the rail is icons only, so two
  // entries sharing a glyph would be indistinguishable.
  { to: '/users', label: 'Users', icon: 'manage_accounts', permission: 'users' },
  { to: '/activity', label: 'Activity Logs', icon: 'history', adminOnly: true },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

export function visibleNav(
  role: Role | undefined,
  can: (key: PermissionKey) => boolean,
  features: NavFeatures,
): NavItem[] {
  const isAdmin = role === 'ADMIN';
  return NAV_ITEMS.filter(
    (item) =>
      (!item.adminOnly || isAdmin) &&
      (!item.permission || can(item.permission)) &&
      (!item.feature || features[item.feature]),
  ).map((item) =>
    !isAdmin && item.staffLabel ? { ...item, label: item.staffLabel } : item,
  );
}
