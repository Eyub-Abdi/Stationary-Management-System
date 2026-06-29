/**
 * Grantable staff capabilities. Admins always have all of them; STAFF have only
 * the ones an admin has put in their `permissions` list. Add a new capability
 * here, then guard the relevant endpoints with @Permission('<key>').
 */
export const PERMISSION_KEYS = [
  'products',
  'services',
  'purchases',
  'inventory',
  'suppliers',
  'reports',
  'officePurchases',
  'users',
  'settings',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export function isPermissionKey(value: string): value is PermissionKey {
  return (PERMISSION_KEYS as readonly string[]).includes(value);
}
