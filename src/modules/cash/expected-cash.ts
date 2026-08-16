import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { add, money, sub } from '../../common/utils/money';
import { PrismaService } from '../../prisma/prisma.service';

type CashClient = Prisma.TransactionClient | PrismaService;

export interface CashBreakdown {
  openingBalance: string;
  cashSales: string;
  customerPayments: string;
  deposits: string;
  refunds: string;
  withdrawals: string;
  expenses: string;
  purchases: string;
  supplierPayments: string;
  expectedAmount: string;
}

/**
 * What the drawer should hold right now.
 *
 * This lives outside CashService because anything that takes cash out of the
 * till needs to ask the question first — banking it, lending it — and routing
 * those through the service would tie the modules in a knot. One formula, one
 * place; a second copy of it would be a second thing to get wrong.
 */
export async function computeBreakdown(
  client: CashClient,
  sessionId: string,
): Promise<CashBreakdown> {
  const session = await client.cashSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: { openingBalance: true },
  });

  const [sales, custPayments, deposits, withdrawals, expenses, returns, purchases, supPayments] =
    await Promise.all([
      // Only the CASH actually collected at sale time (credit balances excluded).
      client.sale.aggregate({
        where: { cashSessionId: sessionId, status: 'COMPLETED' },
        _sum: { amountPaid: true },
      }),
      client.customerPayment.aggregate({
        where: { cashSessionId: sessionId },
        _sum: { amount: true },
      }),
      client.cashMovement.aggregate({
        where: { cashSessionId: sessionId, type: 'DEPOSIT' },
        _sum: { amount: true },
      }),
      client.cashMovement.aggregate({
        where: { cashSessionId: sessionId, type: 'WITHDRAWAL' },
        _sum: { amount: true },
      }),
      client.expense.aggregate({
        where: { cashSessionId: sessionId },
        _sum: { amount: true },
      }),
      client.saleReturn.aggregate({
        where: { cashSessionId: sessionId },
        _sum: { totalRefund: true, creditApplied: true },
      }),
      // Cash paid out of the till for stock purchases (down payment / full).
      client.purchase.aggregate({
        where: { cashSessionId: sessionId },
        _sum: { amountPaid: true },
      }),
      client.supplierPayment.aggregate({
        where: { cashSessionId: sessionId },
        _sum: { amount: true },
      }),
    ]);

  const opening = money(session.openingBalance);
  const cashSales = money(sales._sum.amountPaid ?? 0);
  const custPay = money(custPayments._sum.amount ?? 0);
  const dep = money(deposits._sum.amount ?? 0);
  const wd = money(withdrawals._sum.amount ?? 0);
  const exp = money(expenses._sum.amount ?? 0);
  // Only the cash portion of refunds leaves the till; credit-applied refunds
  // reduce the customer's balance instead.
  const refunds = sub(
    money(returns._sum.totalRefund ?? 0),
    money(returns._sum.creditApplied ?? 0),
  );
  const purch = money(purchases._sum.amountPaid ?? 0);
  const supPay = money(supPayments._sum.amount ?? 0);

  // Expected = opening + cashSales + customerPayments + deposits
  //            − expenses − withdrawals − refunds − purchases − supplierPayments
  const inflow = add(opening, cashSales, custPay, dep);
  const outflow = add(exp, wd, refunds, purch, supPay);
  const expected: Decimal = sub(inflow, outflow);

  return {
    openingBalance: opening.toFixed(2),
    cashSales: cashSales.toFixed(2),
    customerPayments: custPay.toFixed(2),
    deposits: dep.toFixed(2),
    refunds: refunds.toFixed(2),
    withdrawals: wd.toFixed(2),
    expenses: exp.toFixed(2),
    purchases: purch.toFixed(2),
    supplierPayments: supPay.toFixed(2),
    expectedAmount: expected.toFixed(2),
  };
}

/**
 * Refuses to take out more cash than the drawer holds.
 *
 * Without this a mistyped transfer leaves the till expecting a negative amount,
 * and every close after it reports a shortage nobody took — the same shape of
 * error as an opening float that was never really in the drawer.
 */
export async function assertTillCovers(
  client: CashClient,
  sessionId: string,
  amount: Decimal,
  action: string,
): Promise<void> {
  const { expectedAmount } = await computeBreakdown(client, sessionId);
  const available = money(expectedAmount);
  if (amount.greaterThan(available)) {
    throw new BadRequestException(
      `The till holds ${available.toFixed(2)}; ${amount.toFixed(2)} is more than that. ` +
        `Count the drawer before ${action}.`,
    );
  }
}
