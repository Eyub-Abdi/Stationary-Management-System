import { SetMetadata } from '@nestjs/common';

/** Grantable staff capabilities (admins always have all of them). */
export type PermissionKey = 'products' | 'services' | 'purchases' | 'inventory';

export const PERMISSION_KEY = 'required_permission';

/**
 * Require a grantable permission on a route/controller. Admins always pass;
 * STAFF must have the matching grant. Enforced by PermissionsGuard.
 */
export const Permission = (key: PermissionKey) => SetMetadata(PERMISSION_KEY, key);
