/** Grantable staff capabilities. Mirrors the backend common/permissions.ts. */
export type PermissionKey =
  | 'products'
  | 'services'
  | 'purchases'
  | 'inventory'
  | 'suppliers'
  | 'reports'
  | 'officePurchases'
  | 'users'
  | 'settings';

/** Admin-facing labels for the per-staff permission checkboxes (Users page). */
export const PERMISSION_OPTIONS: { key: PermissionKey; label: string; hint: string }[] = [
  { key: 'products', label: 'Products', hint: 'Add/edit products & categories' },
  { key: 'services', label: 'Services', hint: 'Add/edit services' },
  { key: 'purchases', label: 'Purchases', hint: 'Record stock & manage units' },
  { key: 'inventory', label: 'Inventory', hint: 'Adjust stock counts' },
  { key: 'suppliers', label: 'Suppliers', hint: 'Add/edit suppliers & payments' },
  { key: 'reports', label: 'Reports & analytics', hint: 'Reports, profit, product movement' },
  { key: 'officePurchases', label: 'Office purchases', hint: 'Record internal/office buying' },
  { key: 'users', label: 'Users', hint: 'Manage staff accounts (not admins)' },
  { key: 'settings', label: 'Settings & backup', hint: 'Business, backup & system settings' },
];
