import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { SellUnit } from '../../common/enums/sell-unit.enum';

/**
 * Unit tests for the money-critical sale paths: cash vs credit settlement,
 * dual-unit inventory consumption (selling by the pack draws pieces), and
 * returns that apply to a customer's credit balance before paying cash.
 * Prisma + inventory/sequence/audit are mocked; no database is touched.
 */
describe('SalesService', () => {
  const D = (n: number) => new Prisma.Decimal(n);

  // Stock and pricing live on the variant; BULK is the wholesale price tier.
  const VARIANT = {
    id: 'v1',
    label: 'Default',
    status: 'ACTIVE',
    productId: 'p1',
    sellingPrice: D(12000),
    wholesalePrice: D(10000),
    product: {
      id: 'p1',
      name: 'Blue Pen',
      status: 'ACTIVE',
      baseUnit: 'pcs',
      bulkUnit: 'Box',
      unitSize: 12,
    },
  };

  // Builds a SalesService with a mocked tx and records key writes.
  const build = (overrides: { customerBalance?: number; creditLimit?: number } = {}) => {
    const calls: Record<string, unknown[]> = {};
    const record = (k: string, v: unknown) => (calls[k] = [...(calls[k] ?? []), v]);

    const tx = {
      sale: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => {
          record('sale.create', data);
          return Promise.resolve({ id: 's1', ...data });
        }),
        update: jest.fn().mockImplementation(({ data }) => {
          record('sale.update', data);
          return Promise.resolve({ id: 's1', ...data });
        }),
      },
      cashSession: {
        findUnique: jest.fn().mockResolvedValue({ id: 'sess1', userId: 'user1', status: 'OPEN' }),
      },
      customer: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'c1',
          name: 'Ayub',
          isActive: true,
          balance: D(overrides.customerBalance ?? 0),
          creditLimit: overrides.creditLimit != null ? D(overrides.creditLimit) : null,
        }),
        update: jest.fn().mockImplementation((args) => {
          record('customer.update', args);
          return Promise.resolve({});
        }),
      },
      productVariant: { findUnique: jest.fn().mockResolvedValue(VARIANT) },
      serviceVariant: { findUnique: jest.fn() },
      saleItem: {
        create: jest.fn().mockImplementation(({ data }) => {
          record('saleItem.create', data);
          return Promise.resolve({ id: 'si1', ...data });
        }),
      },
      cogsAllocation: { create: jest.fn().mockResolvedValue({}) },
    } as unknown as Prisma.TransactionClient;

    const prisma = {
      sale: { findUnique: jest.fn().mockResolvedValue(null) },
      runSerializable: jest.fn().mockImplementation((cb) => cb(tx)),
    };
    const inventory = {
      consumeFifoTx: jest.fn().mockImplementation((_tx, _pid, qty) => {
        record('consume', qty);
        return Promise.resolve({
          allocations: [{ batchId: 'b1', quantity: qty, unitCost: D(5000), cost: D(5000 * qty) }],
          totalCost: new Decimal(5000 * qty),
        });
      }),
      applyMovementTx: jest.fn().mockImplementation((_tx, p) => {
        record('movement', p);
        return Promise.resolve({ beforeQty: 0, afterQty: 0 });
      }),
    };
    const sequences = { next: jest.fn().mockResolvedValue('DOC-1') };
    const audit = { recordTx: jest.fn().mockResolvedValue(undefined) };
    const customers = { allocateToInvoices: jest.fn().mockResolvedValue([]) };
    // Books open by default; individual tests make assertOpen throw.
    const periods = { assertOpen: jest.fn().mockResolvedValue(undefined) };

    const service = new SalesService(
      prisma as never,
      inventory as never,
      sequences as never,
      audit as never,
      customers as never,
      periods as never,
    );
    return { service, calls, tx, periods };
  };

  describe('create', () => {
    const cashLine = (over: Partial<CreateSaleDto> = {}): CreateSaleDto => ({
      cashSessionId: 'sess1',
      items: [{ itemType: 'PRODUCT', variantId: 'v1', quantity: 2 }],
      cashReceived: 30000,
      ...over,
    });

    it('settles a cash sale and returns change', async () => {
      const { service, calls } = build();
      await service.create(cashLine({ cashReceived: 30000 }), 'user1');

      const sale = calls['sale.create'][0] as Record<string, Prisma.Decimal>;
      expect(sale.total.toString()).toBe('24000'); // 2 × 12000
      expect(sale.amountPaid.toString()).toBe('24000');
      expect(sale.amountDue.toString()).toBe('0');
      expect(sale.changeGiven.toString()).toBe('6000');
      expect(calls['customer.update']).toBeUndefined();
    });

    it('rejects a cash sale with insufficient cash', async () => {
      const { service } = build();
      await expect(
        service.create(cashLine({ cashReceived: 1000 }), 'user1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('records a credit sale and grows the customer receivable', async () => {
      const { service, calls } = build();
      await service.create(
        cashLine({ paymentMethod: 'CREDIT', customerId: 'c1', cashReceived: 10000 }),
        'user1',
      );

      const sale = calls['sale.create'][0] as Record<string, unknown>;
      expect((sale.amountPaid as Prisma.Decimal).toString()).toBe('10000');
      expect((sale.amountDue as Prisma.Decimal).toString()).toBe('14000');
      expect(sale.customerId).toBe('c1');

      const cust = calls['customer.update'][0] as {
        data: { balance: { increment: Prisma.Decimal } };
      };
      expect(cust.data.balance.increment.toString()).toBe('14000');
    });

    it('rejects a credit sale that would breach the credit limit', async () => {
      // Limit 20,000; balance 10,000; this sale adds 14,000 → 24,000 > 20,000.
      const { service } = build({ customerBalance: 10000, creditLimit: 20000 });
      await expect(
        service.create(
          cashLine({ paymentMethod: 'CREDIT', customerId: 'c1', cashReceived: 10000 }),
          'user1',
        ),
      ).rejects.toThrow(/credit limit exceeded/i);
    });

    it('allows a credit sale within the credit limit', async () => {
      const { service, calls } = build({ customerBalance: 0, creditLimit: 50000 });
      await service.create(
        cashLine({ paymentMethod: 'CREDIT', customerId: 'c1', cashReceived: 0 }),
        'user1',
      );
      const sale = calls['sale.create'][0] as Record<string, Prisma.Decimal>;
      expect(sale.amountDue.toString()).toBe('24000');
    });

    it('requires a customer for credit sales', async () => {
      const { service } = build();
      await expect(
        service.create(cashLine({ paymentMethod: 'CREDIT' }), 'user1'),
      ).rejects.toThrow(/customer is required/i);
    });

    it('rejects a credit down payment that exceeds the total', async () => {
      const { service } = build();
      await expect(
        service.create(
          cashLine({ paymentMethod: 'CREDIT', customerId: 'c1', cashReceived: 99999 }),
          'user1',
        ),
      ).rejects.toThrow(/cannot exceed total/i);
    });

    it('charges the wholesale price tier when selling BULK, still by the piece', async () => {
      const { service, calls } = build();
      await service.create(
        {
          cashSessionId: 'sess1',
          items: [{ itemType: 'PRODUCT', variantId: 'v1', quantity: 2, sellUnit: SellUnit.BULK }],
          cashReceived: 25000,
        },
        'user1',
      );

      // Everything sells by the piece now — BULK only switches the price tier.
      expect(calls['consume'][0]).toBe(2);
      expect((calls['movement'][0] as { quantity: number }).quantity).toBe(-2);

      const item = calls['saleItem.create'][0] as Record<string, unknown>;
      expect(item.unitLabel).toBe('pcs');
      expect(item.unitSize).toBe(1);
      expect((item.unitPriceSnapshot as Prisma.Decimal).toString()).toBe('10000');

      const sale = calls['sale.create'][0] as Record<string, Prisma.Decimal>;
      expect(sale.total.toString()).toBe('20000'); // 2 × 10000 wholesale
      expect(sale.changeGiven.toString()).toBe('5000');
    });

    it('rejects a BULK line when the variant has no wholesale price', async () => {
      const { service, tx } = build();
      (tx.productVariant.findUnique as jest.Mock).mockResolvedValueOnce({
        ...VARIANT,
        wholesalePrice: D(0),
      });
      await expect(
        service.create(
          {
            cashSessionId: 'sess1',
            items: [{ itemType: 'PRODUCT', variantId: 'v1', quantity: 2, sellUnit: SellUnit.BULK }],
            cashReceived: 25000,
          },
          'user1',
        ),
      ).rejects.toThrow(/no wholesale price/i);
    });
  });

  describe('returnSale', () => {
    // A credit sale (total 24,000) where the customer paid 10,000 and still
    // owes 14,000. Returning all goods refunds 24,000 — which should clear the
    // 14,000 debt first, leaving 10,000 to refund in cash.
    const buildReturn = () => {
      const calls: Record<string, unknown[]> = {};
      const record = (k: string, v: unknown) => (calls[k] = [...(calls[k] ?? []), v]);

      const sale = {
        id: 's1',
        status: 'COMPLETED',
        customerId: 'c1',
        amountDue: D(14000),
        customer: { id: 'c1', balance: D(14000) },
        items: [
          {
            id: 'si1',
            itemType: 'PRODUCT',
            productId: 'p1',
            variantId: 'v1',
            nameSnapshot: 'Blue Pen',
            quantity: 2,
            unitSize: 1,
            returnedQuantity: 0,
            lineTotal: D(24000),
            allocations: [
              { id: 'a1', batchId: 'b1', quantity: 2, unitCost: D(5000), returnedQuantity: 0 },
            ],
          },
        ],
      };

      const tx = {
        sale: {
          findUnique: jest.fn().mockResolvedValue(sale),
          update: jest.fn().mockImplementation((args) => {
            record('sale.update', args);
            return Promise.resolve({});
          }),
        },
        cashSession: {
          findUnique: jest.fn().mockResolvedValue({ id: 'sess1', userId: 'user1', status: 'OPEN' }),
        },
        saleReturn: {
          create: jest.fn().mockResolvedValue({ id: 'r1', returnNumber: 'RET-1' }),
          update: jest.fn().mockImplementation(({ data }) => {
            record('saleReturn.update', data);
            return Promise.resolve({ id: 'r1', returnNumber: 'RET-1', ...data });
          }),
        },
        saleReturnItem: { create: jest.fn().mockResolvedValue({}) },
        saleItem: { update: jest.fn().mockResolvedValue({}) },
        inventoryBatch: { update: jest.fn().mockResolvedValue({}) },
        cogsAllocation: { update: jest.fn().mockResolvedValue({}) },
        customer: {
          update: jest.fn().mockImplementation((args) => {
            record('customer.update', args);
            return Promise.resolve({});
          }),
        },
      } as unknown as Prisma.TransactionClient;

      const prisma = { runSerializable: jest.fn().mockImplementation((cb) => cb(tx)) };
      const inventory = { applyMovementTx: jest.fn().mockResolvedValue({}) };
      const sequences = { next: jest.fn().mockResolvedValue('RET-1') };
      const audit = { recordTx: jest.fn().mockResolvedValue(undefined) };
      const customers = { allocateToInvoices: jest.fn().mockResolvedValue([]) };
      const periods = { assertOpen: jest.fn().mockResolvedValue(undefined) };

      const service = new SalesService(
        prisma as never,
        inventory as never,
        sequences as never,
        audit as never,
        customers as never,
        periods as never,
      );
      return { service, calls, customers };
    };

    it('applies a credit-sale refund to the balance first, cash on the surplus', async () => {
      const { service, calls, customers } = buildReturn();
      await service.returnSale(
        's1',
        { cashSessionId: 'sess1', items: [{ saleItemId: 'si1', quantity: 2 }], reason: 'damaged goods' },
        'user1',
      );

      const ret = calls['saleReturn.update'][0] as Record<string, Prisma.Decimal>;
      expect(ret.totalRefund.toString()).toBe('24000');
      expect(ret.creditApplied.toString()).toBe('14000'); // cleared the debt
      // cash portion = 24000 − 14000 = 10000 (not stored, but implied)

      const cust = calls['customer.update'][0] as {
        data: { balance: { decrement: Prisma.Decimal } };
      };
      expect(cust.data.balance.decrement.toString()).toBe('14000');

      // The credit is allocated across invoices (this sale earmarked first).
      const [, custId, amt, prefer] = customers.allocateToInvoices.mock.calls[0];
      expect(custId).toBe('c1');
      expect((amt as Prisma.Decimal).toString()).toBe('14000');
      expect(prefer).toBe('s1');
    });
  });
});
