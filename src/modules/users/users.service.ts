import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { PaginationQueryDto, paginate } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

/** Public-safe user projection (never expose passwordHash). */
export type SafeUser = Omit<User, 'passwordHash'>;

const SAFE_SELECT = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto): Promise<SafeUser> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }
    const passwordHash = await this.hash(dto.password);
    return this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        fullName: dto.fullName,
        role: dto.role,
        passwordHash,
      },
      select: SAFE_SELECT,
    });
  }

  async findAll(query: PaginationQueryDto & { role?: Role }) {
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.search
        ? {
            OR: [
              { fullName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: SAFE_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginate(data, total, query.page, query.limit);
  }

  async findOne(id: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: SAFE_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /** Internal: includes passwordHash for credential verification. */
  findByEmailWithHash(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
  }

  async update(id: string, dto: UpdateUserDto): Promise<SafeUser> {
    await this.findOne(id);
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.email ? { email: dto.email.toLowerCase() } : {}),
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.role ? { role: dto.role } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      select: SAFE_SELECT,
    });
  }

  async setActive(id: string, isActive: boolean): Promise<SafeUser> {
    await this.findOne(id);
    return this.prisma.user.update({
      where: { id },
      data: { isActive },
      select: SAFE_SELECT,
    });
  }

  /**
   * Permanently deletes a user. Refused for the actor's own account, and for
   * any user who already has activity (sales, payments, audit logs, …) — those
   * carry foreign-key references and must be deactivated instead to preserve
   * history. Refresh tokens cascade away automatically.
   */
  async remove(id: string, actorId: string): Promise<{ id: string }> {
    if (id === actorId) {
      throw new BadRequestException('You cannot delete your own account.');
    }
    await this.findOne(id);
    try {
      await this.prisma.user.delete({ where: { id } });
      return { id };
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2003'
      ) {
        throw new ConflictException(
          'This user has activity history (sales, payments, audit logs) and cannot be deleted. Deactivate the account instead.',
        );
      }
      throw e;
    }
  }

  async changePassword(id: string, newPassword: string): Promise<void> {
    await this.findOne(id);
    const passwordHash = await this.hash(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { passwordHash } }),
      // Invalidate all sessions on password change.
      this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async markLogin(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  }

  verifyPassword(hash: string, plain: string): Promise<boolean> {
    return argon2.verify(hash, plain);
  }

  private hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }
}
