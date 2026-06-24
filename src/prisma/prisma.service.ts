import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Single shared PrismaClient. Connection pooling is handled by the driver;
 * tune via the `connection_limit` parameter on DATABASE_URL in production.
 *
 * The transaction isolation level used by financial/inventory operations is
 * Serializable — see `runSerializable`. This prevents lost updates / phantom
 * reads on stock and cash balances under concurrency.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { level: 'warn', emit: 'event' },
        { level: 'error', emit: 'event' },
      ],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Prisma connected to PostgreSQL');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Run a unit of work in a Serializable transaction with bounded retries on
   * serialization failures (Postgres error 40001) and deadlocks (40P01).
   * Use for every multi-row financial/inventory mutation.
   */
  async runSerializable<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { maxRetries?: number; timeoutMs?: number },
  ): Promise<T> {
    const maxRetries = options?.maxRetries ?? 3;
    let attempt = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        return await this.$transaction(fn, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: options?.timeoutMs ?? 15_000,
          maxWait: 5_000,
        });
      } catch (err) {
        const code = (err as Prisma.PrismaClientKnownRequestError)?.code;
        const isRetryable =
          code === 'P2034' || // write conflict / deadlock detected by Prisma
          this.isPgSerializationError(err);

        if (isRetryable && attempt < maxRetries) {
          attempt += 1;
          const backoff = 25 * 2 ** attempt + Math.floor(Math.random() * 25);
          this.logger.warn(
            `Transaction conflict (attempt ${attempt}/${maxRetries}), retrying in ${backoff}ms`,
          );
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }
        throw err;
      }
    }
  }

  private isPgSerializationError(err: unknown): boolean {
    const meta = (err as { meta?: { code?: string } })?.meta;
    return meta?.code === '40001' || meta?.code === '40P01';
  }
}
