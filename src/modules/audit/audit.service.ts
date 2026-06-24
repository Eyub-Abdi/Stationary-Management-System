import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditEntry {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  /** Any JSON-serializable context (DTOs, before/after snapshots, ...). */
  metadata?: Record<string, unknown> | unknown[] | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Append-only audit logging. AuditLog rows are NEVER updated or deleted by the
 * application (enforce with DB-level revocation of UPDATE/DELETE in production).
 *
 * Two ways to record:
 *  - `record()`  : standalone write (own connection).
 *  - `recordTx()`: write inside an existing transaction so the audit row is
 *                  committed atomically with the business mutation. Always use
 *                  this for financial/inventory operations.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({ data: this.toData(entry) });
  }

  async recordTx(
    tx: Prisma.TransactionClient,
    entry: AuditEntry,
  ): Promise<void> {
    await tx.auditLog.create({ data: this.toData(entry) });
  }

  private toData(entry: AuditEntry): Prisma.AuditLogUncheckedCreateInput {
    return {
      userId: entry.userId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      metadata: (entry.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
    };
  }
}
