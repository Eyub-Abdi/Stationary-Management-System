import { SetMetadata } from '@nestjs/common';
import { PermissionKey } from '../permissions';

export const PERMISSION_KEY = 'required_permission';

/**
 * Require at least one of the given grantable permissions on a route/controller.
 * Admins always pass; STAFF must have one of the listed keys in their grants.
 * Enforced by PermissionsGuard.
 */
export const Permission = (...keys: PermissionKey[]) => SetMetadata(PERMISSION_KEY, keys);
