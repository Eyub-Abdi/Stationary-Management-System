import { Injectable } from '@nestjs/common';
import { Prisma, StockAdjustmentReason } from '@prisma/client';
import { add, money, sub } from '../../common/utils/money';
import { PrismaService } from '../../prisma/prisma.service';
import { CashService } from '../cash/cash.service';
import {
  REASON_LABELS,
  isLossReason,
} from '../inventory/adjustment-reasons';
import { findOpenSession } from '../cash/open-session';
import {
  ReportGranularity,
  ReportRangeDto,
  SalesReportQueryDto,
} from './dto/report-query.dto';

const TRUNC_UNIT: Record<ReportGranularity, string> = {
  [ReportGranularity.DAILY]: 'day',
  [ReportGranularity.WEEKLY]: 'week',
  [ReportGranularity.MONTHLY]: 'month',
};

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cash: CashService,
  ) {}

  // ---- Money position ------------------------------------------------------

  /**
   * Where the shop's money is sitting right now, as opposed to what it earned.
   *
   * Profit answers "did we do well"; this answers "where is it". The three are
   * kept apart on purpose: cash in the drawer, cash at the bank, and cash a shop
   * member is holding. That last one is a debt owed to the shop — an asset, not
   * a cost — so it appears here and never in the profit figures.
   */
  async moneyPosition() {
    const openSession = await findOpenSession(this.prisma);

    const [bank, loans, lastClosed] = await Promise.all([
      this.prisma.bankTransaction.aggregate({ _sum: { amount: true } }),
      this.prisma.loan.findMany({
        where: { status: 'OUTSTANDING' },
        select: {
          amount: true,
          dueDate: true,
          user: { select: { id: true, fullName: true } },
          repayments: { select: { amount: true } },
        },
      }),
      this.prisma.cashSession.findFirst({
        where: { status: 'CLOSED', actualAmount: { not: null } },
        orderBy: { closedAt: 'desc' },
        select: { actualAmount: true, closingWithdrawal: true, closedAt: true },
      }),
    ]);

    // With the till open, cash in hand is what the drawer should hold right now.
    // With it closed, it is whatever the last shift left behind.
    const inHand = openSession
      ? money((await this.cash.summary(openSession.id)).breakdown.expectedAmount)
      : sub(
          money(lastClosed?.actualAmount ?? 0),
          money(lastClosed?.closingWithdrawal ?? 0),
        );

    const today = new Date();
    let owed = money(0);
    let overdue = money(0);
    for (const loan of loans) {
      const paid = loan.repayments.reduce((a, r) => add(a, r.amount), money(0));
      const left = sub(money(loan.amount), paid);
      if (left.lte(0)) continue;
      owed = add(owed, left);
      if (loan.dueDate < today) overdue = add(overdue, left);
    }

    const atBank = money(bank._sum.amount ?? 0);

    return {
      inHand: inHand.toFixed(2),
      atBank: atBank.toFixed(2),
      // Cash the shop still controls, wherever it sits.
      liquid: add(inHand, atBank).toFixed(2),
      owedByMembers: owed.toFixed(2),
      overdueFromMembers: overdue.toFixed(2),
      total: add(inHand, atBank, owed).toFixed(2),
      tillOpen: !!openSession,
      asOf: new Date().toISOString(),
    };
  }

  // ---- Sales ---------------------------------------------------------------

  /** Time-bucketed sales: revenue, COGS, gross profit, count per period.
   *  Also reports expenses and purchases falling in each period. */
  async salesSeries(query: SalesReportQueryDto) {
    const unit = TRUNC_UNIT[query.granularity]; // whitelisted, safe to inline
    const salesRange = this.dateFilter('"createdAt"', query);
    const expenseRange = this.dateFilter('"expenseDate"', query);
    const purchaseRange = this.dateFilter('"purchaseDate"', query);

    const adjustmentRange = this.dateFilter('"createdAt"', query);
    const returnRange = this.dateFilter('"createdAt"', query);

    const [rows, expenseRows, purchaseRows, wastageRows, returnRows] =
      await Promise.all([
      this.prisma.$queryRaw<
        {
          period: Date;
          revenue: string;
          cogs: string;
          gross_profit: string;
          sale_count: bigint;
        }[]
      >(Prisma.sql`
        SELECT date_trunc(${unit}, "createdAt") AS period,
               COALESCE(SUM(total), 0)::text          AS revenue,
               COALESCE(SUM("totalCogs"), 0)::text    AS cogs,
               COALESCE(SUM(total - "totalCogs"), 0)::text AS gross_profit,
               COUNT(*)                               AS sale_count
        FROM sales
        WHERE status = 'COMPLETED' ${salesRange}
        GROUP BY period
        ORDER BY period ASC;
      `),
      this.prisma.$queryRaw<{ period: Date; expenses: string }[]>(Prisma.sql`
        SELECT date_trunc(${unit}, "expenseDate") AS period,
               COALESCE(SUM(amount), 0)::text      AS expenses
        FROM expenses
        WHERE TRUE ${expenseRange}
        GROUP BY period;
      `),
      this.prisma.$queryRaw<{ period: Date; purchases: string }[]>(Prisma.sql`
        SELECT date_trunc(${unit}, "purchaseDate") AS period,
               COALESCE(SUM("totalCost"), 0)::text AS purchases
        FROM purchases
        WHERE TRUE ${purchaseRange}
        GROUP BY period;
      `),
      // Net stock written off in the bucket, as a positive cost.
      this.prisma.$queryRaw<{ period: Date; stock_loss: string }[]>(Prisma.sql`
        SELECT date_trunc(${unit}, "createdAt")      AS period,
               COALESCE(-SUM("costImpact"), 0)::text AS stock_loss
        FROM inventory_adjustments
        WHERE TRUE ${adjustmentRange}
        GROUP BY period;
      `),
      // Returns are backed out of the bucket they were processed in, matching
      // the financial summary. Without this the series would drift from the
      // headline figures the moment a customer brought something back.
      this.prisma.$queryRaw<{ period: Date; refunds: string; cogs_reversed: string }[]>(Prisma.sql`
        SELECT date_trunc(${unit}, "createdAt")            AS period,
               COALESCE(SUM("totalRefund"), 0)::text       AS refunds,
               COALESCE(SUM("totalCogsReversed"), 0)::text AS cogs_reversed
        FROM sale_returns
        WHERE TRUE ${returnRange}
        GROUP BY period;
      `),
    ]);

    const expenseByPeriod = new Map(
      expenseRows.map((r) => [r.period.getTime(), r.expenses]),
    );
    const purchaseByPeriod = new Map(
      purchaseRows.map((r) => [r.period.getTime(), r.purchases]),
    );
    const stockLossByPeriod = new Map(
      wastageRows.map((r) => [r.period.getTime(), r.stock_loss]),
    );
    const returnByPeriod = new Map(
      returnRows.map((r) => [
        r.period.getTime(),
        { refunds: money(r.refunds), cogsReversed: money(r.cogs_reversed) },
      ]),
    );

    const salesByPeriod = new Map(rows.map((r) => [r.period.getTime(), r]));

    // Every bucket that saw ANY activity, not just the ones with sales in them.
    // A quiet day that still paid rent has to appear, or the totals under the
    // table would leave that rent out.
    const periods = [
      ...new Set([
        ...salesByPeriod.keys(),
        ...expenseByPeriod.keys(),
        ...purchaseByPeriod.keys(),
        ...stockLossByPeriod.keys(),
        ...returnByPeriod.keys(),
      ]),
    ].sort((a, b) => a - b);

    return periods.map((key) => {
      const row = salesByPeriod.get(key);
      const back = returnByPeriod.get(key);
      // Net of returns, exactly as financialSummary does it.
      const revenue = sub(money(row?.revenue ?? 0), back?.refunds ?? money(0));
      const cogs = sub(money(row?.cogs ?? 0), back?.cogsReversed ?? money(0));
      return {
        period: new Date(key),
        revenue: revenue.toFixed(2),
        cogs: cogs.toFixed(2),
        grossProfit: sub(revenue, cogs).toFixed(2),
        refunds: (back?.refunds ?? money(0)).toFixed(2),
        saleCount: Number(row?.sale_count ?? 0),
        expenses: expenseByPeriod.get(key) ?? '0',
        purchases: purchaseByPeriod.get(key) ?? '0',
        stockLoss: stockLossByPeriod.get(key) ?? '0',
      };
    });
  }

  // ---- Financial summary ---------------------------------------------------

  /** Revenue, COGS, gross profit, expenses and net profit for a range. */
  async financialSummary(query: ReportRangeDto) {
    const saleWhere: Prisma.SaleWhereInput = {
      status: 'COMPLETED',
      ...(query.from || query.to
        ? { createdAt: { gte: query.from, lte: query.to } }
        : {}),
    };
    const expenseWhere: Prisma.ExpenseWhereInput =
      query.from || query.to
        ? { expenseDate: { gte: query.from, lte: query.to } }
        : {};

    const returnWhere: Prisma.SaleReturnWhereInput =
      query.from || query.to
        ? { createdAt: { gte: query.from, lte: query.to } }
        : {};

    const adjustmentWhere: Prisma.InventoryAdjustmentWhereInput =
      query.from || query.to
        ? { createdAt: { gte: query.from, lte: query.to } }
        : {};

    const [sales, expenses, returns, writeOffs, writeOns] = await Promise.all([
      this.prisma.sale.aggregate({
        where: saleWhere,
        _sum: { total: true, totalCogs: true },
        _count: true,
      }),
      this.prisma.expense.aggregate({
        where: expenseWhere,
        _sum: { amount: true },
      }),
      this.prisma.saleReturn.aggregate({
        where: returnWhere,
        _sum: { totalRefund: true, totalCogsReversed: true },
      }),
      // Stock written off by hand — jams, spoilage, shrinkage. costImpact is
      // the FIFO cost of what left the shelf, signed negative.
      this.prisma.inventoryAdjustment.aggregate({
        where: { ...adjustmentWhere, quantityChange: { lt: 0 } },
        _sum: { costImpact: true },
      }),
      // Stock written back on. Value appearing without a purchase behind it, so
      // it offsets the losses rather than counting as income.
      this.prisma.inventoryAdjustment.aggregate({
        where: { ...adjustmentWhere, quantityChange: { gt: 0 } },
        _sum: { costImpact: true },
      }),
    ]);

    const grossSales = money(sales._sum.total ?? 0);
    const refunds = money(returns._sum.totalRefund ?? 0);
    // Net of returns: revenue and COGS both back out the returned portion.
    const revenue = sub(grossSales, refunds);
    const cogs = sub(
      money(sales._sum.totalCogs ?? 0),
      money(returns._sum.totalCogsReversed ?? 0),
    );
    const grossProfit = sub(revenue, cogs);
    const totalExpenses = money(expenses._sum.amount ?? 0);
    // costImpact is signed like the quantity, so a write-off arrives negative.
    // Flip it: stockLoss is a positive number meaning money gone.
    const writtenOff = money(writeOffs._sum.costImpact ?? 0).negated();
    const writtenOn = money(writeOns._sum.costImpact ?? 0);
    const stockLoss = sub(writtenOff, writtenOn);
    // Stock that spoils is as real a cost as rent. Leaving it out overstated
    // profit by exactly the value of everything ever written off.
    const netProfit = sub(sub(grossProfit, totalExpenses), stockLoss);

    return {
      range: { from: query.from ?? null, to: query.to ?? null },
      grossSales: grossSales.toFixed(2),
      refunds: refunds.toFixed(2),
      revenue: revenue.toFixed(2),
      cogs: cogs.toFixed(2),
      grossProfit: grossProfit.toFixed(2),
      expenses: totalExpenses.toFixed(2),
      stockWrittenOff: writtenOff.toFixed(2),
      stockWrittenOn: writtenOn.toFixed(2),
      stockLoss: stockLoss.toFixed(2),
      netProfit: netProfit.toFixed(2),
      saleCount: sales._count,
    };
  }

  /** Expense totals grouped by category for a range. */
  async expensesByCategory(query: ReportRangeDto) {
    const where: Prisma.ExpenseWhereInput =
      query.from || query.to
        ? { expenseDate: { gte: query.from, lte: query.to } }
        : {};
    const grouped = await this.prisma.expense.groupBy({
      by: ['categoryId'],
      where,
      _sum: { amount: true },
      _count: true,
    });
    // Categories are user-managed rows now, so resolve their display names.
    const categories = await this.prisma.expenseCategory.findMany({
      where: { id: { in: grouped.map((g) => g.categoryId) } },
      select: { id: true, name: true, icon: true },
    });
    const byId = new Map(categories.map((c) => [c.id, c]));

    return grouped.map((g) => ({
      categoryId: g.categoryId,
      category: byId.get(g.categoryId)?.name ?? 'Unknown',
      icon: byId.get(g.categoryId)?.icon ?? 'category',
      total: money(g._sum.amount ?? 0).toFixed(2),
      count: g._count,
    }));
  }

  // ---- Wastage -------------------------------------------------------------

  /**
   * What the shop destroyed, lost or recounted away, and what it cost.
   *
   * Three cuts of the same rows, because the useful questions differ: which
   * kind of loss dominates (byReason), which stock it eats (byProduct), and
   * which job causes it (byService — the one that answers "is this printer
   * getting worse"). Costs come from the FIFO batches actually consumed.
   */
  async wastageReport(query: ReportRangeDto) {
    const where: Prisma.InventoryAdjustmentWhereInput = {
      ...(query.from || query.to
        ? { createdAt: { gte: query.from, lte: query.to } }
        : {}),
    };
    const range = this.dateFilter('a."createdAt"', query);

    const [byReason, byProduct, byService, totals] = await Promise.all([
      // Units out and units in are counted separately. Netting them would let
      // one delivery written back on hide a month of jams behind a single
      // small number.
      this.prisma.$queryRaw<
        {
          reasonCode: StockAdjustmentReason;
          units_out: bigint;
          units_in: bigint;
          cost: string;
          entries: bigint;
        }[]
      >(Prisma.sql`
        SELECT a."reasonCode"                                                        AS "reasonCode",
               COALESCE(SUM(CASE WHEN a."quantityChange" < 0 THEN -a."quantityChange" ELSE 0 END), 0) AS units_out,
               COALESCE(SUM(CASE WHEN a."quantityChange" > 0 THEN  a."quantityChange" ELSE 0 END), 0) AS units_in,
               COALESCE(-SUM(a."costImpact"), 0)::text                               AS cost,
               COUNT(*)                                                              AS entries
        FROM inventory_adjustments a
        WHERE TRUE ${range}
        GROUP BY a."reasonCode";
      `),
      this.prisma.$queryRaw<
        {
          variantId: string;
          sku: string;
          name: string;
          baseUnit: string;
          units: bigint;
          cost: string;
          entries: bigint;
        }[]
      >(Prisma.sql`
        SELECT v.id                            AS "variantId",
               v.sku                           AS sku,
               p.name || CASE WHEN v.label <> 'Default' THEN ' — ' || v.label ELSE '' END AS name,
               p."baseUnit"                    AS "baseUnit",
               -SUM(a."quantityChange")        AS units,
               COALESCE(-SUM(a."costImpact"), 0)::text AS cost,
               COUNT(*)                        AS entries
        FROM inventory_adjustments a
        JOIN product_variants v ON v.id = a."variantId"
        JOIN products p         ON p.id = v."productId"
        WHERE a."quantityChange" < 0 ${range}
        GROUP BY v.id, p.id
        ORDER BY COALESCE(-SUM(a."costImpact"), 0) DESC;
      `),
      this.prisma.$queryRaw<
        {
          serviceVariantId: string;
          name: string;
          units: bigint;
          cost: string;
          entries: bigint;
        }[]
      >(Prisma.sql`
        SELECT sv.id                           AS "serviceVariantId",
               s.name || ' — ' || sv.label     AS name,
               -SUM(a."quantityChange")        AS units,
               COALESCE(-SUM(a."costImpact"), 0)::text AS cost,
               COUNT(*)                        AS entries
        FROM inventory_adjustments a
        JOIN service_variants sv ON sv.id = a."serviceVariantId"
        JOIN services s          ON s.id = sv."serviceId"
        WHERE a."quantityChange" < 0 ${range}
        GROUP BY sv.id, s.id
        ORDER BY COALESCE(-SUM(a."costImpact"), 0) DESC;
      `),
      this.prisma.inventoryAdjustment.aggregate({
        where,
        _sum: { costImpact: true },
      }),
    ]);

    // A negative costImpact is value gone; report it as a positive cost.
    const netLoss = money(totals._sum.costImpact ?? 0).negated();

    return {
      range: { from: query.from ?? null, to: query.to ?? null },
      netLoss: netLoss.toFixed(2),
      byReason: byReason
        .map((r) => ({
          reasonCode: r.reasonCode,
          reason: REASON_LABELS[r.reasonCode],
          isLoss: isLossReason(r.reasonCode),
          unitsOut: Number(r.units_out),
          unitsIn: Number(r.units_in),
          cost: r.cost,
          entries: Number(r.entries),
        }))
        .sort((a, b) => Number(b.cost) - Number(a.cost) || b.unitsOut - a.unitsOut),
      byProduct: byProduct.map((r) => ({
        variantId: r.variantId,
        sku: r.sku,
        name: r.name,
        baseUnit: r.baseUnit,
        units: Number(r.units),
        cost: r.cost,
        entries: Number(r.entries),
      })),
      byService: byService.map((r) => ({
        serviceVariantId: r.serviceVariantId,
        name: r.name,
        units: Number(r.units),
        cost: r.cost,
        entries: Number(r.entries),
      })),
    };
  }

  /** The individual write-offs behind the wastage totals, newest first. */
  async wastageEntries(query: ReportRangeDto, limit = 100) {
    const rows = await this.prisma.inventoryAdjustment.findMany({
      where: {
        ...(query.from || query.to
          ? { createdAt: { gte: query.from, lte: query.to } }
          : {}),
      },
      include: {
        variant: { select: { sku: true, label: true } },
        product: { select: { name: true, baseUnit: true } },
        user: { select: { id: true, fullName: true } },
        serviceVariant: {
          select: { label: true, service: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      name:
        r.variant.label && r.variant.label !== 'Default'
          ? `${r.product.name} — ${r.variant.label}`
          : r.product.name,
      sku: r.variant.sku,
      baseUnit: r.product.baseUnit,
      quantityChange: r.quantityChange,
      reasonCode: r.reasonCode,
      reason: r.reason,
      cost: money(r.costImpact ?? 0).negated().toFixed(2),
      user: r.user.fullName,
      service: r.serviceVariant
        ? `${r.serviceVariant.service.name} — ${r.serviceVariant.label}`
        : null,
    }));
  }

  // ---- Inventory -----------------------------------------------------------

  /** Current stock levels with valuation per product. */
  async stockLevels() {
    const rows = await this.prisma.$queryRaw<
      {
        sku: string;
        name: string;
        currentStock: number;
        minStockLevel: number;
        valuation: string;
      }[]
    >(Prisma.sql`
      SELECT p.sku,
             p.name,
             COALESCE(SUM(v."currentStock"), 0)::int  AS "currentStock",
             COALESCE(SUM(v."minStockLevel"), 0)::int AS "minStockLevel",
             COALESCE(SUM(b.value), 0)::text          AS valuation
      FROM products p
      LEFT JOIN product_variants v ON v."productId" = p.id
      LEFT JOIN (
        SELECT "variantId", SUM("remainingQuantity" * "unitCost") AS value
        FROM inventory_batches GROUP BY "variantId"
      ) b ON b."variantId" = v.id
      GROUP BY p.id
      ORDER BY p.name ASC;
    `);
    return rows;
  }

  lowStock() {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT v.sku AS sku,
             p.name || CASE WHEN v.label <> 'Default' THEN ' — ' || v.label ELSE '' END AS name,
             v."currentStock",
             v."minStockLevel"
      FROM product_variants v
      JOIN products p ON p.id = v."productId"
      WHERE v.status = 'ACTIVE' AND v."currentStock" <= v."minStockLevel"
      ORDER BY (v."currentStock" - v."minStockLevel") ASC;
    `);
  }

  /** Best-selling products by quantity & revenue for a range. */
  async topProducts(query: ReportRangeDto, limit = 10) {
    const range = this.dateFilter('s."createdAt"', query);
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT si."productId",
             si."nameSnapshot"           AS name,
             SUM(si.quantity)            AS units_sold,
             SUM(si."lineTotal")::text   AS revenue,
             SUM(si."lineCogs")::text    AS cogs
      FROM sale_items si
      JOIN sales s ON s.id = si."saleId"
      WHERE s.status = 'COMPLETED' AND si."itemType" = 'PRODUCT' ${range}
      GROUP BY si."productId", si."nameSnapshot"
      ORDER BY units_sold DESC
      LIMIT ${limit};
    `);
  }

  /**
   * Per-product realized profitability for a range. Uses the immutable sale-line
   * snapshots: revenue = SUM(lineTotal), COGS = SUM(lineCogs) (FIFO actual cost),
   * both NET of returns. A line sold in a bulk (wholesale) unit has unitSize > 1;
   * a line sold per piece has unitSize = 1 — so we split the quantity into
   * wholesale vs retail. Quantities are normalised to base units (pieces) for the
   * total. Only COMPLETED sales (voids excluded) count.
   */
  async productProfitability(query: ReportRangeDto) {
    const range = this.dateFilter('s."createdAt"', query);
    const rows = await this.prisma.$queryRaw<
      {
        productId: string;
        sku: string;
        name: string;
        baseUnit: string;
        bulkUnit: string | null;
        unitSize: number;
        buyingPrice: string;
        sellingPrice: string;
        bulkSellingPrice: string | null;
        qtyBase: bigint;
        wholesaleUnits: bigint;
        retailUnits: bigint;
        revenue: string;
        cogs: string;
      }[]
    >(Prisma.sql`
      SELECT v.id                       AS "productId",
             v.sku                      AS sku,
             p.name || CASE WHEN v.label <> 'Default' THEN ' — ' || v.label ELSE '' END AS name,
             p."baseUnit"               AS "baseUnit",
             p."bulkUnit"               AS "bulkUnit",
             p."unitSize"               AS "unitSize",
             v."buyingPrice"::text      AS "buyingPrice",
             v."sellingPrice"::text     AS "sellingPrice",
             v."bulkSellingPrice"::text AS "bulkSellingPrice",
             COALESCE(SUM((si.quantity - si."returnedQuantity") * si."unitSize"), 0) AS "qtyBase",
             COALESCE(SUM(CASE WHEN si."unitSize" > 1 THEN si.quantity - si."returnedQuantity" ELSE 0 END), 0) AS "wholesaleUnits",
             COALESCE(SUM(CASE WHEN si."unitSize" = 1 THEN si.quantity - si."returnedQuantity" ELSE 0 END), 0) AS "retailUnits",
             COALESCE(SUM(si."lineTotal" - COALESCE(r.refund, 0)), 0)::text  AS revenue,
             COALESCE(SUM(si."lineCogs"  - COALESCE(r.cogs_rev, 0)), 0)::text AS cogs
      FROM sale_items si
      JOIN sales s            ON s.id = si."saleId"
      JOIN product_variants v ON v.id = si."variantId"
      JOIN products p         ON p.id = v."productId"
      LEFT JOIN (
        SELECT sri."saleItemId",
               SUM(sri."refundAmount") AS refund,
               SUM(sri."cogsReversed") AS cogs_rev
        FROM sale_return_items sri
        GROUP BY sri."saleItemId"
      ) r ON r."saleItemId" = si.id
      WHERE s.status = 'COMPLETED' AND si."itemType" = 'PRODUCT' ${range}
      GROUP BY v.id, p.id
      HAVING SUM(si.quantity - si."returnedQuantity") > 0
      ORDER BY (COALESCE(SUM(si."lineTotal" - COALESCE(r.refund, 0)), 0)
                - COALESCE(SUM(si."lineCogs" - COALESCE(r.cogs_rev, 0)), 0)) DESC;
    `);

    return rows.map((row) => {
      const revenue = money(row.revenue);
      const cogs = money(row.cogs);
      const grossProfit = sub(revenue, cogs);
      const margin = revenue.greaterThan(0)
        ? grossProfit.dividedBy(revenue).times(100)
        : money(0);
      return {
        productId: row.productId,
        sku: row.sku,
        name: row.name,
        baseUnit: row.baseUnit,
        bulkUnit: row.bulkUnit,
        unitSize: row.unitSize,
        buyingPrice: row.buyingPrice,
        sellingPrice: row.sellingPrice,
        bulkSellingPrice: row.bulkSellingPrice,
        qtyBase: Number(row.qtyBase),
        wholesaleUnits: Number(row.wholesaleUnits),
        retailUnits: Number(row.retailUnits),
        revenue: revenue.toFixed(2),
        cogs: cogs.toFixed(2),
        grossProfit: grossProfit.toFixed(2),
        margin: margin.toFixed(1),
      };
    });
  }

  /**
   * Product movement (sales velocity) for a range. For every ACTIVE product:
   *  - unitsSold  = base units sold in the range, net of returns,
   *  - currentStock = live stock on hand (base units),
   *  - lastSoldAt = most recent COMPLETED sale ALL-TIME (drives dead-stock /
   *    "days since last sale"), independent of the selected range.
   * Velocity, days-of-cover and the fast/slow/dead classification are derived
   * client-side so they adapt to the shop's own volume.
   */
  async productMovement(query: ReportRangeDto) {
    const range = this.dateFilter('s."createdAt"', query);
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT v.id            AS "productId",
             v.sku           AS sku,
             p.name || CASE WHEN v.label <> 'Default' THEN ' — ' || v.label ELSE '' END AS name,
             p."baseUnit"    AS "baseUnit",
             v."currentStock" AS "currentStock",
             COALESCE(m.units_sold, 0)::int AS "unitsSold",
             ls.last_sold    AS "lastSoldAt"
      FROM product_variants v
      JOIN products p ON p.id = v."productId"
      LEFT JOIN (
        SELECT si."variantId",
               SUM((si.quantity - si."returnedQuantity") * si."unitSize") AS units_sold
        FROM sale_items si
        JOIN sales s ON s.id = si."saleId"
        WHERE s.status = 'COMPLETED' AND si."itemType" = 'PRODUCT' ${range}
        GROUP BY si."variantId"
      ) m ON m."variantId" = v.id
      LEFT JOIN (
        SELECT si."variantId", MAX(s."createdAt") AS last_sold
        FROM sale_items si
        JOIN sales s ON s.id = si."saleId"
        WHERE s.status = 'COMPLETED' AND si."itemType" = 'PRODUCT'
        GROUP BY si."variantId"
      ) ls ON ls."variantId" = v.id
      WHERE p.status = 'ACTIVE' AND v.status = 'ACTIVE'
      ORDER BY "unitsSold" DESC, name ASC;
    `);
  }

  /**
   * Best-selling service options (e.g. "Printing B&W — A3") by revenue for a
   * range, net of returns. Services carry no COGS, so this is revenue + count.
   */
  async topServices(query: ReportRangeDto, limit = 10) {
    const range = this.dateFilter('s."createdAt"', query);
    const rows = await this.prisma.$queryRaw<
      { serviceVariantId: string; name: string; jobs: bigint; revenue: string }[]
    >(Prisma.sql`
      SELECT sv.id AS "serviceVariantId",
             svc.name || CASE WHEN sv.label <> 'Standard' THEN ' — ' || sv.label ELSE '' END AS name,
             COALESCE(SUM(si.quantity - si."returnedQuantity"), 0)            AS jobs,
             COALESCE(SUM(si."lineTotal" - COALESCE(r.refund, 0)), 0)::text   AS revenue
      FROM sale_items si
      JOIN sales s             ON s.id = si."saleId"
      JOIN service_variants sv ON sv.id = si."serviceVariantId"
      JOIN services svc        ON svc.id = sv."serviceId"
      LEFT JOIN (
        SELECT sri."saleItemId", SUM(sri."refundAmount") AS refund
        FROM sale_return_items sri GROUP BY sri."saleItemId"
      ) r ON r."saleItemId" = si.id
      WHERE s.status = 'COMPLETED' AND si."itemType" = 'SERVICE' ${range}
      GROUP BY sv.id, svc.id
      HAVING SUM(si.quantity - si."returnedQuantity") > 0
      ORDER BY COALESCE(SUM(si."lineTotal" - COALESCE(r.refund, 0)), 0) DESC
      LIMIT ${limit};
    `);
    return rows.map((r) => ({
      serviceVariantId: r.serviceVariantId,
      name: r.name,
      jobs: Number(r.jobs),
      revenue: money(r.revenue).toFixed(2),
    }));
  }

  // ---- Cash ----------------------------------------------------------------

  cashSessions(status?: 'OPEN' | 'CLOSED') {
    return this.prisma.cashSession.findMany({
      where: status ? { status } : {},
      include: { user: { select: { fullName: true } } },
      orderBy: { openedAt: 'desc' },
    });
  }

  // ---- User activity -------------------------------------------------------

  /** Per-staff sales activity (count, revenue) for a range. */
  async userActivity(query: ReportRangeDto) {
    const range = this.dateFilter('s."createdAt"', query);
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT u.id            AS "userId",
             u."fullName"    AS name,
             u.role          AS role,
             COUNT(s.id)                       AS sale_count,
             COALESCE(SUM(s.total), 0)::text   AS revenue
      FROM users u
      LEFT JOIN sales s
        ON s."userId" = u.id AND s.status = 'COMPLETED' ${range}
      GROUP BY u.id
      ORDER BY revenue DESC;
    `);
  }

  // ---- helpers -------------------------------------------------------------

  /** Builds an optional "AND col BETWEEN from AND to" SQL fragment. */
  private dateFilter(column: string, query: ReportRangeDto): Prisma.Sql {
    const col = Prisma.raw(column);
    if (query.from && query.to) {
      return Prisma.sql`AND ${col} BETWEEN ${query.from} AND ${query.to}`;
    }
    if (query.from) return Prisma.sql`AND ${col} >= ${query.from}`;
    if (query.to) return Prisma.sql`AND ${col} <= ${query.to}`;
    return Prisma.empty;
  }
}
