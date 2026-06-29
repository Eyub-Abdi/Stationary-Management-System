import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: 'ADMIN' | 'STAFF';
  /** Per-staff grants (admins are allowed regardless of these). */
  canManageProducts: boolean;
  canManageServices: boolean;
  canManagePurchases: boolean;
}

/**
 * Injects the authenticated user (populated by JwtStrategy) into a handler.
 * Usage: `create(@CurrentUser() user: AuthenticatedUser) {}`
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser;
    return data ? user?.[data] : user;
  },
);
