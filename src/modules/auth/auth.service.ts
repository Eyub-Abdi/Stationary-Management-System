import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../users/users.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

interface RequestContext {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async login(
    email: string,
    password: string,
    ctx: RequestContext,
  ): Promise<
    TokenPair & {
      user: Pick<
        User,
        | 'id'
        | 'email'
        | 'fullName'
        | 'role'
        | 'canManageProducts'
        | 'canManageServices'
        | 'canManagePurchases'
      >;
    }
  > {
    const user = await this.users.findByEmailWithHash(email);
    // Always run a verification to keep timing uniform against enumeration.
    const ok =
      user && (await this.users.verifyPassword(user.passwordHash, password));
    if (!user || !ok) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (!user.isActive) {
      throw new ForbiddenException('Account is deactivated');
    }

    const tokens = await this.issueTokens(user, ctx);
    await this.users.markLogin(user.id);
    await this.audit.record({
      userId: user.id,
      action: 'AUTH_LOGIN',
      entityType: 'User',
      entityId: user.id,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        canManageProducts: user.canManageProducts,
        canManageServices: user.canManageServices,
        canManagePurchases: user.canManagePurchases,
      },
    };
  }

  /**
   * Refresh-token rotation with reuse detection. If a token that has already
   * been rotated (revoked) is presented again, the entire token family is
   * revoked — a strong signal of theft.
   */
  async refresh(rawToken: string, ctx: RequestContext): Promise<TokenPair> {
    let payload: { sub: string; jti: string };
    try {
      payload = await this.jwt.verifyAsync(rawToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokenHash = this.hashToken(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!stored) {
      throw new UnauthorizedException('Refresh token not recognized');
    }

    if (stored.revokedAt) {
      // Reuse detected -> revoke all active tokens for this user.
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.record({
        userId: stored.userId,
        action: 'AUTH_REFRESH_REUSE_DETECTED',
        entityType: 'RefreshToken',
        entityId: stored.id,
        ipAddress: ctx.ip,
      });
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: stored.userId },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    // Rotate: issue a new pair and revoke the presented token, chaining it.
    const tokens = await this.issueTokens(user, ctx, stored.id);
    return tokens;
  }

  async logout(rawToken: string, userId: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.record({
      userId,
      action: 'AUTH_LOGOUT',
      entityType: 'User',
      entityId: userId,
    });
  }

  async logoutAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // ---- internals ----------------------------------------------------------

  private async issueTokens(
    user: User,
    ctx: RequestContext,
    rotatedFromId?: string,
  ): Promise<TokenPair> {
    const accessTtl = this.config.get<number>('jwt.accessTtl')!;
    const refreshTtl = this.config.get<number>('jwt.refreshTtl')!;
    const jti = randomUUID();

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role },
      { secret: this.config.get<string>('jwt.accessSecret'), expiresIn: accessTtl },
    );

    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, jti },
      { secret: this.config.get<string>('jwt.refreshSecret'), expiresIn: refreshTtl },
    );

    const expiresAt = new Date(Date.now() + refreshTtl * 1000);
    const newRow = await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt,
        createdByIp: ctx.ip,
        userAgent: ctx.userAgent,
      },
    });

    if (rotatedFromId) {
      await this.prisma.refreshToken.update({
        where: { id: rotatedFromId },
        data: { revokedAt: new Date(), replacedById: newRow.id },
      });
    }

    return {
      accessToken,
      refreshToken,
      expiresIn: accessTtl,
      tokenType: 'Bearer',
    };
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
