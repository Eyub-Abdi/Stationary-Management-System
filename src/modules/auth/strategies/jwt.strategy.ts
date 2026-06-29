import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../prisma/prisma.service';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: 'ADMIN' | 'STAFF';
}

/**
 * Validates the access token signature/expiry, then confirms the user still
 * exists and is active on every request (so deactivation takes effect at once,
 * even before the short-lived access token expires).
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret'),
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        canManageProducts: true,
        canManageServices: true,
        canManagePurchases: true,
      },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account is inactive or no longer exists');
    }
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      canManageProducts: user.canManageProducts,
      canManageServices: user.canManageServices,
      canManagePurchases: user.canManagePurchases,
    };
  }
}
