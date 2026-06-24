import { Injectable } from '@nestjs/common';
import { Prisma, SequenceType } from '@prisma/client';

/**
 * Generates gapless, concurrency-safe sequential document numbers
 * (invoice / transaction / purchase). Implemented with an atomic
 * INSERT ... ON CONFLICT DO UPDATE ... RETURNING, which takes a row lock and
 * is safe under Serializable transactions and high concurrency — no two callers
 * can ever receive the same number.
 *
 * Format examples:
 *   INVOICE     -> INV-202606-000123
 *   TRANSACTION -> TXN-202606-000123
 *   PURCHASE    -> PO-202606-000045
 *
 * MUST be called with the active transaction client so the number is reserved
 * atomically with the document it belongs to.
 */
@Injectable()
export class SequenceService {
  private readonly prefixes: Record<SequenceType, string> = {
    INVOICE: 'INV',
    TRANSACTION: 'TXN',
    PURCHASE: 'PO',
    RETURN: 'RET',
  };

  async next(
    tx: Prisma.TransactionClient,
    type: SequenceType,
    when: Date = new Date(),
  ): Promise<string> {
    const period = this.periodKey(when);
    const rows = await tx.$queryRaw<{ current: number }[]>(Prisma.sql`
      INSERT INTO document_sequences (id, type, period, current)
      VALUES (gen_random_uuid(), ${type}::"SequenceType", ${period}, 1)
      ON CONFLICT (type, period)
      DO UPDATE SET current = document_sequences.current + 1
      RETURNING current;
    `);
    const value = rows[0].current;
    const padded = String(value).padStart(6, '0');
    return `${this.prefixes[type]}-${period}-${padded}`;
  }

  private periodKey(date: Date): string {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${y}${m}`;
  }
}
