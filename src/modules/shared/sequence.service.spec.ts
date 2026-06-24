import { Prisma } from '@prisma/client';
import { SequenceService } from './sequence.service';

describe('SequenceService', () => {
  let service: SequenceService;

  beforeEach(() => {
    service = new SequenceService();
  });

  const txReturning = (current: number) =>
    ({
      $queryRaw: jest.fn().mockResolvedValue([{ current }]),
    }) as unknown as Prisma.TransactionClient;

  it('formats invoice numbers as PREFIX-YYYYMM-000000', async () => {
    const when = new Date(Date.UTC(2026, 5, 21)); // June 2026
    const n = await service.next(txReturning(123), 'INVOICE', when);
    expect(n).toBe('INV-202606-000123');
  });

  it('uses the right prefix per sequence type', async () => {
    const when = new Date(Date.UTC(2026, 0, 1)); // Jan 2026
    expect(await service.next(txReturning(1), 'TRANSACTION', when)).toBe(
      'TXN-202601-000001',
    );
    expect(await service.next(txReturning(7), 'PURCHASE', when)).toBe(
      'PO-202601-000007',
    );
    expect(await service.next(txReturning(9), 'RETURN', when)).toBe(
      'RET-202601-000009',
    );
  });
});
