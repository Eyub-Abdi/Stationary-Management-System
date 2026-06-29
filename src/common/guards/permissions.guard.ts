import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PERMISSION_KEY,
  PermissionKey,
} from '../decorators/permission.decorator';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * Enforces grantable staff permissions declared with @Permission(). Admins
 * always pass; a STAFF user passes only when the matching grant is enabled on
 * their account. Runs after authentication, alongside RolesGuard.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const key = this.reflector.getAllAndOverride<PermissionKey>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!key) return true;

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    if (!user) throw new ForbiddenException('Not authenticated');
    if (user.role === 'ADMIN') return true;

    const granted =
      key === 'products'
        ? user.canManageProducts
        : key === 'services'
          ? user.canManageServices
          : key === 'purchases'
            ? user.canManagePurchases
            : user.canManageInventory;

    if (!granted) {
      throw new ForbiddenException(
        `You don't have permission to manage ${key}. Ask an administrator to grant it.`,
      );
    }
    return true;
  }
}
