import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../decorators/permission.decorator';
import { PermissionKey } from '../permissions';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * Enforces grantable staff permissions declared with @Permission(...keys).
 * Admins always pass; a STAFF user passes when their grants include at least
 * one of the required keys. Runs after authentication, alongside RolesGuard.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const keys = this.reflector.getAllAndOverride<PermissionKey[]>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!keys || keys.length === 0) return true;

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    if (!user) throw new ForbiddenException('Not authenticated');
    if (user.role === 'ADMIN') return true;

    const granted = keys.some((k) => user.permissions.includes(k));
    if (!granted) {
      throw new ForbiddenException(
        `You don't have permission for this action. Ask an administrator to grant it.`,
      );
    }
    return true;
  }
}
