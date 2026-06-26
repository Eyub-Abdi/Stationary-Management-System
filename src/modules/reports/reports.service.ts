import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { money, sub } from '../../common/utils/money';
import { PrismaService } from '../../prisma/prisma.service';
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
  constructor(private readonly prisma: PrismaService) {}

  // ---- Sales ---------------------------------------------------------------

  /** Time-bucketed sales: revenue, COGS, gross profit, count per period. */
  async salesSeries(query: SalesReportQueryDto) {
    const unit = TRUNC_UNIT[query.granularity]; // whitelisted, safe to inline
    const range = this.dateFilter('"createdAt"', query);

    const rows = await this.prisma.$queryRaw<
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
      WHERE status = 'COMPLETED' ${range}
      GROUP BY period
      ORDER BY period ASC;
    `);

    return rows.map((r) => ({
      period: r.period,
      revenue: r.revenue,
      cogs: r.cogs,
      grossProfit: r.gross_profit,
      saleCount: Number(r.sale_count),
    }));
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

    const [sales, expenses, returns] = await Promise.all([
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
    const netProfit = sub(grossProfit, totalExpenses);

    return {
      range: { from: query.from ?? null, to: query.to ?? null },
      grossSales: grossSales.toFixed(2),
      refunds: refunds.toFixed(2),
      revenue: revenue.toFixed(2),
      cogs: cogs.toFixed(2),
      grossProfit: grossProfit.toFixed(2),
      expenses: totalExpenses.toFixed(2),
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
      by: ['category'],
      where,
      _sum: { amount: true },
      _count: true,
    });
    return grouped.map((g) => ({
      category: g.category,
      total: money(g._sum.amount ?? 0).toFixed(2),
      count: g._count,
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
      SELECT p.sku, p.name, p."currentStock", p."minStockLevel",
             COALESCE(SUM(b."remainingQuantity" * b."unitCost"), 0)::text AS valuation
      FROM products p
      LEFT JOIN inventory_batches b ON b."productId" = p.id
      GROUP BY p.id
      ORDER BY p.name ASC;
    `);
    return rows;
  }

  lowStock() {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT sku, name, "currentStock", "minStockLevel"
      FROM products
      WHERE status = 'ACTIVE' AND "currentStock" <= "minStockLevel"
      ORDER BY ("currentStock" - "minStockLevel") ASC;
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
      SELECT p.id                       AS "productId",
             p.sku                      AS sku,
             p.name                     AS name,
             p."baseUnit"               AS "baseUnit",
             p."bulkUnit"               AS "bulkUnit",
             p."unitSize"               AS "unitSize",
             p."buyingPrice"::text      AS "buyingPrice",
             p."sellingPrice"::text     AS "sellingPrice",
             p."bulkSellingPrice"::text AS "bulkSellingPrice",
             COALESCE(SUM((si.quantity - si."returnedQuantity") * si."unitSize"), 0) AS "qtyBase",
             COALESCE(SUM(CASE WHEN si."unitSize" > 1 THEN si.quantity - si."returnedQuantity" ELSE 0 END), 0) AS "wholesaleUnits",
             COALESCE(SUM(CASE WHEN si."unitSize" = 1 THEN si.quantity - si."returnedQuantity" ELSE 0 END), 0) AS "retailUnits",
             COALESCE(SUM(si."lineTotal" - COALESCE(r.refund, 0)), 0)::text  AS revenue,
             COALESCE(SUM(si."lineCogs"  - COALESCE(r.cogs_rev, 0)), 0)::text AS cogs
      FROM sale_items si
      JOIN sales s    ON s.id = si."saleId"
      JOIN products p ON p.id = si."productId"
      LEFT JOIN (
        SELECT sri."saleItemId",
               SUM(sri."refundAmount") AS refund,
               SUM(sri."cogsReversed") AS cogs_rev
        FROM sale_return_items sri
        GROUP BY sri."saleItemId"
      ) r ON r."saleItemId" = si.id
      WHERE s.status = 'COMPLETED' AND si."itemType" = 'PRODUCT' ${range}
      GROUP BY p.id
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
