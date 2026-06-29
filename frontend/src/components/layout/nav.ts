import type { Role } from '@/types';
import type { PermissionKey } from '@/providers/AuthProvider';

export interface NavItem {
  to: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
  /** Visible to admins, or to staff granted this permission. */
  permission?: PermissionKey;
  // Alternate label shown to non-admin staff (e.g. "Expenses" → "Petty Cash").
  staffLabel?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: 'dashboard' },
  { to: '/pos', label: 'Point of Sale', icon: 'point_of_sale' },
  { to: '/sales', label: 'Sales', icon: 'receipt_long' },
  { to: '/customers', label: 'Customers', icon: 'group' },
  { to: '/products', label: 'Products', icon: 'inventory_2' },
  { to: '/services', label: 'Services', icon: 'print' },
  { to: '/inventory', label: 'Inventory', icon: 'package_2' },
  { to: '/purchases', label: 'Purchases', icon: 'shopping_cart', permission: 'purchases' },
  { to: '/suppliers', label: 'Suppliers', icon: 'local_shipping', permission: 'suppliers' },
  { to: '/expenses', label: 'Expenses', icon: 'payments', staffLabel: 'Petty Cash' },
  { to: '/office-purchases', label: 'Office Purchases', icon: 'business_center', permission: 'officePurchases' },
  { to: '/cash', label: 'Cash Management', icon: 'account_balance' },
  { to: '/reports', label: 'Reports', icon: 'assessment', permission: 'reports' },
  { to: '/profit', label: 'Profit Analysis', icon: 'trending_up', permission: 'reports' },
  { to: '/movement', label: 'Product Movement', icon: 'insights', permission: 'reports' },
  { to: '/users', label: 'Users', icon: 'group', permission: 'users' },
  { to: '/activity', label: 'Activity Logs', icon: 'history', adminOnly: true },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

export function visibleNav(
  role: Role | undefined,
  can: (key: PermissionKey) => boolean,
): NavItem[] {
  const isAdmin = role === 'ADMIN';
  return NAV_ITEMS.filter(
    (item) => (!item.adminOnly || isAdmin) && (!item.permission || can(item.permission)),
  ).map((item) =>
    !isAdmin && item.staffLabel ? { ...item, label: item.staffLabel } : item,
  );
}
