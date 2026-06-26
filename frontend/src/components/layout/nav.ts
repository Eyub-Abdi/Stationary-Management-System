import type { Role } from '@/types';

export interface NavItem {
  to: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
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
  { to: '/purchases', label: 'Purchases', icon: 'shopping_cart', adminOnly: true },
  { to: '/suppliers', label: 'Suppliers', icon: 'local_shipping', adminOnly: true },
  { to: '/expenses', label: 'Expenses', icon: 'payments', staffLabel: 'Petty Cash' },
  { to: '/cash', label: 'Cash Management', icon: 'account_balance' },
  { to: '/reports', label: 'Reports', icon: 'assessment', adminOnly: true },
  { to: '/profit', label: 'Profit Analysis', icon: 'trending_up', adminOnly: true },
  { to: '/movement', label: 'Product Movement', icon: 'insights', adminOnly: true },
  { to: '/users', label: 'Users', icon: 'group', adminOnly: true },
  { to: '/activity', label: 'Activity Logs', icon: 'history', adminOnly: true },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

export function visibleNav(role: Role | undefined): NavItem[] {
  const isAdmin = role === 'ADMIN';
  return NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin).map((item) =>
    !isAdmin && item.staffLabel ? { ...item, label: item.staffLabel } : item,
  );
}
