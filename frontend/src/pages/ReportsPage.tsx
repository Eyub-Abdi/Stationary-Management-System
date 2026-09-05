import { useMemo, useState } from 'react';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Icon,
  LoadingState,
  PageHeader,
  PeriodPicker,
  Skeleton,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  Tabs,
} from '@/components/ui';
import { AreaTrendChart, DonutChart, MiniBarChart } from '@/components/charts/Charts';
import { useToast } from '@/providers/ToastProvider';
import {
  useCashReport,
  useExpensesByCategory,
  useFinancialSummary,
  useReportLowStock,
  useSalesSeries,
  useStockLevels,
  useTopProducts,
  useTopServices,
  useUserActivityReport,
  useWastageEntries,
  useWastageReport,
} from '@/hooks/useReports';
import { useSupplierSummary } from '@/hooks/useCatalog';
import { useCustomerAging } from '@/hooks/useCustomers';
import { useClientSort } from '@/hooks/useSort';
import { ADJUSTMENT_REASONS, CHART_COLORS } from '@/lib/constants';
import { cn, currency, formatDate, formatDateTime, num } from '@/lib/utils';
import { resolvePeriod, type Period } from '@/lib/period';

interface StatementRow {
  label: string;
  value: string;
  /** `deduction` is subtracted from the line above; `subtotal`/`total` are sums. */
  kind: 'item' | 'deduction' | 'subtotal' | 'total';
}

type TabKey =
  | 'financial'
  | 'sales'
  | 'expenses'
  | 'inventory'
  | 'wastage'
  | 'cash'
  | 'staff';

function exportCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const toast = useToast();
  // The month to date is the figure the shop is actually running on; a rolling
  // week cuts across the month boundary and matches nothing it reports on.
  const [period, setPeriod] = useState<Period>({ kind: 'thisMonth' });
  const [tab, setTab] = useState<TabKey>('financial');
  const range = useMemo(() => resolvePeriod(period), [period]);
  const r = { from: range.from, to: range.to };

  const summary = useFinancialSummary(r);
  // Long spans get monthly buckets, or the axis is unreadable.
  const monthly = range.granularity === 'MONTHLY';
  const series = useSalesSeries({ ...r, granularity: range.granularity });
  const expenseMix = useExpensesByCategory(r);
  const topProducts = useTopProducts(r, tab === 'sales' || tab === 'inventory');
  const topServices = useTopServices(r, tab === 'sales');
  const stockLevels = useStockLevels(tab === 'inventory');
  const lowStock = useReportLowStock(tab === 'inventory');
  const wastage = useWastageReport(r, tab === 'wastage');
  const wastageEntries = useWastageEntries(r, tab === 'wastage');
  const cash = useCashReport(tab === 'cash');
  const staff = useUserActivityReport(r, tab === 'staff');

  // The statement's one figure the financial summary does not carry. The series
  // is already loaded for this range, so summing its buckets costs no request.
  const purchases = useMemo(
    () => (series.data ?? []).reduce((a, pt) => a + num(pt.purchases), 0),
    [series.data],
  );

  // The month-end statement, read straight down: what was sold, what it cost,
  // what was spent, what is left. Formerly the Closing the Books detail view.
  const statementRows = useMemo((): StatementRow[] => {
    const d = summary.data;
    if (!d) return [];
    // A deduction of nothing is still nothing — "−TZS 0" only reads as a typo.
    const less = (v: string) => (num(v) === 0 ? currency(0) : `−${currency(v)}`);
    return [
      { label: 'Gross sales', value: currency(d.grossSales), kind: 'item' },
      { label: 'Less refunds', value: less(d.refunds), kind: 'deduction' },
      { label: 'Revenue', value: currency(d.revenue), kind: 'subtotal' },
      { label: 'Cost of goods sold', value: less(d.cogs), kind: 'deduction' },
      { label: 'Gross profit', value: currency(d.grossProfit), kind: 'subtotal' },
      { label: 'Operating expenses', value: less(d.expenses), kind: 'deduction' },
      // Stock destroyed or written off in the range. On its own line, or the
      // arithmetic from gross to net profit would not read.
      { label: 'Stock written off', value: less(d.stockLoss), kind: 'deduction' },
      { label: 'Net profit', value: currency(d.netProfit), kind: 'total' },
    ];
  }, [summary.data]);

  // Margins earn the width the ledger does not need: the same figures as a
  // proportion, which is how one month is compared with another.
  const revenueNum = num(summary.data?.revenue ?? 0);
  const pct = (v: string | number | undefined) =>
    revenueNum === 0 ? '—' : `${((num(v ?? 0) / revenueNum) * 100).toFixed(1)}%`;

  // Every report table opens on the figure it exists to rank by, and each
  // header can reorder the rows that table holds.
  const productSort = useClientSort(topProducts.data, { by: 'units_sold', dir: 'desc' }, {
    name: (p) => p.name,
    units_sold: (p) => num(p.units_sold),
    revenue: (p) => num(p.revenue),
  });
  const serviceSort = useClientSort(topServices.data, { by: 'revenue', dir: 'desc' }, {
    name: (x) => x.name,
    jobs: (x) => x.jobs,
    revenue: (x) => num(x.revenue),
  });
  const mixSort = useClientSort(expenseMix.data, { by: 'total', dir: 'desc' }, {
    category: (e) => e.category,
    count: (e) => e.count,
    total: (e) => num(e.total),
  });
  const stockSort = useClientSort(stockLevels.data, { by: 'valuation', dir: 'desc' }, {
    name: (x) => x.name,
    currentStock: (x) => x.currentStock,
    valuation: (x) => num(x.valuation),
  });
  const lowStockSort = useClientSort(lowStock.data, { by: 'currentStock', dir: 'asc' }, {
    name: (x) => x.name,
    currentStock: (x) => x.currentStock,
    minStockLevel: (x) => x.minStockLevel,
  });
  const reasonSort = useClientSort(wastage.data?.byReason, { by: 'cost', dir: 'desc' }, {
    reason: (w) => w.reason,
    unitsOut: (w) => w.unitsOut,
    cost: (w) => num(w.cost),
  });
  const wasteProductSort = useClientSort(wastage.data?.byProduct, { by: 'cost', dir: 'desc' }, {
    name: (w) => w.name,
    units: (w) => w.units,
    entries: (w) => w.entries,
    cost: (w) => num(w.cost),
  });
  const wasteServiceSort = useClientSort(wastage.data?.byService, { by: 'cost', dir: 'desc' }, {
    name: (w) => w.name,
    units: (w) => w.units,
    cost: (w) => num(w.cost),
  });
  const entriesSort = useClientSort(wastageEntries.data, { by: 'createdAt', dir: 'desc' }, {
    createdAt: (w) => w.createdAt,
    name: (w) => w.name,
    quantityChange: (w) => w.quantityChange,
    cost: (w) => num(w.cost),
    user: (w) => w.user,
  });
  const cashSort = useClientSort(cash.data, { by: 'openedAt', dir: 'desc' }, {
    openedAt: (x) => x.openedAt,
    user: (x) => x.user?.fullName,
    status: (x) => x.status,
    expectedAmount: (x) => (x.expectedAmount ? num(x.expectedAmount) : null),
    actualAmount: (x) => (x.actualAmount ? num(x.actualAmount) : null),
    variance: (x) => (x.variance != null ? num(x.variance) : null),
  });
  const staffSort = useClientSort(staff.data, { by: 'revenue', dir: 'desc' }, {
    name: (u) => u.name,
    role: (u) => u.role,
    sale_count: (u) => num(u.sale_count),
    revenue: (u) => num(u.revenue),
  });

  // Debt position — live balances, independent of the selected date range.
  const aging = useCustomerAging();
  const supplierDebt = useSupplierSummary();
  const receivables = useMemo(
    () => (aging.data ?? []).reduce((a, r) => a + num(r.balance), 0),
    [aging.data],
  );
  const payables = num(supplierDebt.data?.totalPayable ?? 0);
  const netPosition = receivables - payables;
  const debtLoading = aging.isLoading || supplierDebt.isLoading;

  const seriesData = useMemo(
    () => (series.data ?? []).map((p) => ({ label: formatDate(p.period, monthly ? 'MMM yyyy' : 'dd MMM'), revenue: num(p.revenue), profit: num(p.grossProfit) })),
    [series.data, monthly],
  );
  const mixData = useMemo(
    // The API resolves category names, so they are already display-ready.
    () => (expenseMix.data ?? []).map((e) => ({ name: e.category, value: num(e.total) })),
    [expenseMix.data],
  );
  const mixTotal = mixData.reduce((a, b) => a + b.value, 0);

  const handleExport = () => {
    switch (tab) {
      case 'financial':
        if (summary.data) exportCsv('financial-summary', [{ ...summary.data, range: range.label }]);
        break;
      case 'sales':
        exportCsv('sales-series', (series.data ?? []).map((p) => ({ period: formatDate(p.period), revenue: p.revenue, cogs: p.cogs, grossProfit: p.grossProfit, sales: p.saleCount })));
        break;
      case 'expenses':
        exportCsv('expenses-by-category', (expenseMix.data ?? []).map((e) => ({ category: e.category, total: e.total, count: e.count })));
        break;
      case 'inventory':
        exportCsv('stock-levels', (stockLevels.data ?? []) as unknown as Record<string, unknown>[]);
        break;
      case 'wastage':
        exportCsv(
          'wastage',
          (wastageEntries.data ?? []).map((w) => ({
            date: formatDateTime(w.createdAt),
            item: w.name,
            sku: w.sku,
            units: -w.quantityChange,
            unit: w.baseUnit,
            reason: ADJUSTMENT_REASONS[w.reasonCode]?.label ?? w.reasonCode,
            note: w.reason,
            job: w.service ?? '',
            cost: w.cost,
            recordedBy: w.user,
          })),
        );
        break;
      case 'cash':
        exportCsv('cash-sessions', (cash.data ?? []).map((s) => ({ opened: s.openedAt, closed: s.closedAt, cashier: s.user?.fullName, opening: s.openingBalance, expected: s.expectedAmount, actual: s.actualAmount, variance: s.variance })));
        break;
      case 'staff':
        exportCsv('staff-activity', (staff.data ?? []) as unknown as Record<string, unknown>[]);
        break;
    }
    toast.success('Export ready', 'Your CSV download has started.');
  };

  return (
    <div className="flex flex-col gap-gutter">
      <PageHeader
        title="Reports"
        description="Analyze sales, expenses, profit, inventory and cash performance."
        actions={
          <>
            <PeriodPicker value={period} onChange={setPeriod} />
            <Button variant="outline" icon="download" onClick={handleExport}>
              Export CSV
            </Button>
          </>
        }
      />

      {/* Summary KPIs, always visible. One panel of ruled cells rather than five
          separate cards: five sets of border, shadow, padding and icon chip left
          each figure about a third of its cell, and long shilling amounts were
          the part that got squeezed out. */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-outline-variant bg-outline-variant shadow-sm sm:grid-cols-3 xl:grid-cols-5">
        <KpiCell
          label="Revenue"
          icon="payments"
          value={currency(summary.data?.revenue ?? 0)}
          hint={`${summary.data?.saleCount ?? 0} sales`}
          loading={summary.isLoading}
        />
        <KpiCell
          label="Gross Profit"
          icon="trending_up"
          tone="secondary"
          value={currency(summary.data?.grossProfit ?? 0)}
          hint={`COGS ${currency(summary.data?.cogs ?? 0)}`}
          loading={summary.isLoading}
        />
        <KpiCell
          label="Expenses"
          icon="receipt_long"
          tone="error"
          value={currency(summary.data?.expenses ?? 0)}
          hint="Cost of running the shop"
          loading={summary.isLoading}
        />
        {/* Spoiled stock is a cost like any other. Shown beside expenses so it
            is obvious where the gap between gross and net profit went. */}
        <KpiCell
          label="Stock Wastage"
          icon="delete_sweep"
          tone="error"
          value={currency(summary.data?.stockLoss ?? 0)}
          hint="Jams, spoilage, recounts"
          loading={summary.isLoading}
        />
        {/* The bottom line closes the row, and takes the full width on a phone
            where it would otherwise sit alone in half a column. */}
        <KpiCell
          label="Net Profit"
          icon="account_balance_wallet"
          tone="primary"
          emphasis
          value={currency(summary.data?.netProfit ?? 0)}
          hint={range.label}
          loading={summary.isLoading}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      {/* Debt position — compact squared ledger, distinct from the KPI cards */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <span className="flex items-center gap-1.5 text-label-caps uppercase tracking-wide text-on-surface-variant sm:w-24 sm:shrink-0">
          <Icon name="balance" size={15} />
          Debt
        </span>
        <div className="grid flex-1 grid-cols-3 gap-2 sm:max-w-xl">
          <DebtTile label="Owed to us" hint="Receivables" value={currency(receivables)} accent="secondary" loading={debtLoading} />
          <DebtTile label="We owe" hint="Payables" value={currency(payables)} accent="error" loading={debtLoading} />
          <DebtTile
            label="Net"
            hint={netPosition >= 0 ? 'In our favour' : 'Net owing'}
            value={currency(Math.abs(netPosition))}
            accent={netPosition >= 0 ? 'secondary' : 'error'}
            loading={debtLoading}
          />
        </div>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'financial', label: 'Financial', icon: 'summarize' },
          { value: 'sales', label: 'Sales', icon: 'show_chart' },
          { value: 'expenses', label: 'Expenses', icon: 'pie_chart' },
          { value: 'inventory', label: 'Inventory', icon: 'inventory' },
          { value: 'wastage', label: 'Wastage', icon: 'delete_sweep' },
          { value: 'cash', label: 'Cash', icon: 'account_balance' },
          { value: 'staff', label: 'Staff', icon: 'groups' },
        ]}
      />

      {/* items-start: the charts are a fixed height, so letting the row stretch
          them to match a long table just adds empty space under the plot. */}
      {tab === 'financial' && (
        <div className="grid grid-cols-1 items-start gap-gutter lg:grid-cols-12">
          <Card className="lg:col-span-8">
            <CardHeader title="Revenue & Profit Trend" subtitle={range.label} />
            <div className="px-4 pb-5">
              {series.isLoading ? <LoadingState /> : seriesData.length === 0 ? (
                <EmptyState icon="show_chart" title="No data for this range" />
              ) : (
                <AreaTrendChart data={seriesData} xKey="label" yKey="revenue" color={CHART_COLORS[0]} height={260} />
              )}
            </div>
          </Card>
          <Card className="lg:col-span-4">
            <CardHeader title="Expense Mix" subtitle={range.label} />
            <div className="px-6 pb-6">
              {expenseMix.isLoading ? <LoadingState /> : mixData.length === 0 ? (
                <EmptyState icon="donut_large" title="No expenses" />
              ) : (
                <>
                  <DonutChart data={mixData} centerLabel="Total" centerValue={currency(mixTotal)} />
                  <ul className="mt-4 space-y-2">
                    {mixData.map((d, i) => (
                      <li key={d.name} className="flex items-center justify-between text-body-sm">
                        <span className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                          {d.name}
                        </span>
                        <span className="font-mono-data">{currency(d.value)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </Card>

          <Card className="lg:col-span-12">
            <CardHeader
              title="Statement"
              subtitle={range.label}
              action={
                <Button variant="outline" icon="print" onClick={() => window.print()}>
                  Print
                </Button>
              }
            />
            {summary.isLoading || !summary.data ? (
              <div className="px-6 pb-6">
                <LoadingState label="Building statement…" />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-x-10 px-6 pb-6 lg:grid-cols-12">
                {/* The ledger reads top to bottom; rules sit above the running
                    totals only, so the arithmetic is the thing the eye follows. */}
                <dl className="lg:col-span-7">
                  {statementRows.map((row) => (
                    <StatementLine key={row.label} row={row} />
                  ))}
                </dl>

                <dl className="mt-8 lg:col-span-5 lg:mt-0 lg:border-l lg:border-outline-variant lg:pl-10">
                  <StatementMeta label="Sales recorded" value={summary.data.saleCount.toLocaleString()} />
                  <StatementMeta label="Stock purchased" value={currency(purchases)} />
                  <StatementMeta label="Gross margin" value={pct(summary.data.grossProfit)} />
                  <StatementMeta label="Net margin" value={pct(summary.data.netProfit)} />
                </dl>
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'sales' && (
        <div className="grid grid-cols-1 items-start gap-gutter lg:grid-cols-12">
          <Card className="lg:col-span-7">
            <CardHeader title="Daily Sales" subtitle={range.label} />
            <div className="px-4 pb-5">
              {series.isLoading ? <LoadingState /> : seriesData.length === 0 ? <EmptyState icon="bar_chart" title="No sales" /> : (
                <MiniBarChart data={seriesData} xKey="label" yKey="revenue" color={CHART_COLORS[1]} height={260} />
              )}
            </div>
          </Card>
          <Card className="lg:col-span-5 overflow-hidden">
            <CardHeader title="Top Products" subtitle="By units sold" />
            {topProducts.isLoading ? <LoadingState /> : (topProducts.data?.length ?? 0) === 0 ? (
              <EmptyState icon="trophy" title="No product sales" />
            ) : (
              <Table>
                <THead sort={productSort.sort} onSort={productSort.onSort}>
                  <TH sortKey="name">Product</TH>
                  <TH align="center" sortKey="units_sold" sortDefault="desc">Units</TH>
                  <TH align="right" sortKey="revenue" sortDefault="desc">Revenue</TH>
                </THead>
                <TBody>
                  {productSort.rows.map((p) => (
                    <TR key={p.productId}>
                      <TD className="font-medium">{p.name}</TD>
                      <TD align="center" className="font-mono-data">{num(p.units_sold)}</TD>
                      <TD align="right" className="font-mono-data font-semibold">{currency(p.revenue)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
          <Card className="lg:col-span-12 overflow-hidden">
            <CardHeader title="Top Services" subtitle="By revenue · per option (e.g. A4 / A3)" />
            {topServices.isLoading ? <LoadingState /> : (topServices.data?.length ?? 0) === 0 ? (
              <EmptyState icon="print" title="No service sales" />
            ) : (
              <Table>
                <THead sort={serviceSort.sort} onSort={serviceSort.onSort}>
                  <TH sortKey="name">Service / option</TH>
                  <TH align="center" sortKey="jobs" sortDefault="desc">Jobs</TH>
                  <TH align="right" sortKey="revenue" sortDefault="desc">Revenue</TH>
                </THead>
                <TBody>
                  {serviceSort.rows.map((s) => (
                    <TR key={s.serviceVariantId}>
                      <TD className="font-medium">{s.name}</TD>
                      <TD align="center" className="font-mono-data">{s.jobs}</TD>
                      <TD align="right" className="font-mono-data font-semibold">{currency(s.revenue)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </div>
      )}

      {tab === 'expenses' && (
        <Card>
          <CardHeader title="Expenses by Category" subtitle={range.label} />
          {expenseMix.isLoading ? <LoadingState /> : mixData.length === 0 ? <EmptyState icon="pie_chart" title="No expenses" /> : (
            <Table>
              <THead sort={mixSort.sort} onSort={mixSort.onSort}>
                <TH sortKey="category">Category</TH>
                <TH align="center" sortKey="count" sortDefault="desc">Entries</TH>
                <TH align="right" sortKey="total" sortDefault="desc">Total</TH>
                {/* Share runs in the same order as Total, which already sorts it. */}
                <TH align="right">Share</TH>
              </THead>
              <TBody>
                {mixSort.rows.map((e) => (
                  <TR key={e.categoryId}>
                    <TD className="font-medium">{e.category}</TD>
                    <TD align="center" className="font-mono-data">{e.count}</TD>
                    <TD align="right" className="font-mono-data font-semibold">{currency(e.total)}</TD>
                    <TD align="right" className="font-mono-data">{mixTotal ? Math.round((num(e.total) / mixTotal) * 100) : 0}%</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      )}

      {tab === 'inventory' && (
        <div className="grid grid-cols-1 gap-gutter lg:grid-cols-2">
          <Card className="overflow-hidden">
            <CardHeader title="Stock Levels & Valuation" />
            {stockLevels.isLoading ? <LoadingState /> : (stockLevels.data?.length ?? 0) === 0 ? <EmptyState icon="inventory" title="No inventory" /> : (
              <Table>
                <THead sort={stockSort.sort} onSort={stockSort.onSort}>
                  <TH sortKey="name">Product</TH>
                  <TH align="center" sortKey="currentStock" sortDefault="desc">Stock</TH>
                  <TH align="right" sortKey="valuation" sortDefault="desc">Value</TH>
                </THead>
                <TBody>
                  {stockSort.rows.map((s) => (
                    <TR key={s.sku}>
                      <TD className="font-medium">{s.name}</TD>
                      <TD align="center" className="font-mono-data">{s.currentStock}</TD>
                      <TD align="right" className="font-mono-data font-semibold">{currency(s.valuation)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
          <Card className="overflow-hidden">
            <CardHeader title="Low Stock" />
            {lowStock.isLoading ? <LoadingState /> : (lowStock.data?.length ?? 0) === 0 ? <EmptyState icon="check_circle" title="Stock healthy" /> : (
              <Table>
                <THead sort={lowStockSort.sort} onSort={lowStockSort.onSort}>
                  <TH sortKey="name">Product</TH>
                  <TH align="center" sortKey="currentStock">Current</TH>
                  <TH align="center" sortKey="minStockLevel" sortDefault="desc">Min</TH>
                </THead>
                <TBody>
                  {lowStockSort.rows.map((s) => (
                    <TR key={s.sku}>
                      <TD className="font-medium">{s.name}</TD>
                      <TD align="center" className="font-mono-data font-bold text-error">{s.currentStock}</TD>
                      <TD align="center" className="font-mono-data">{s.minStockLevel}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </div>
      )}

      {tab === 'wastage' && (
        <div className="grid grid-cols-1 items-start gap-gutter lg:grid-cols-12">
          <Card className="lg:col-span-5 overflow-hidden">
            <CardHeader
              title="By Reason"
              subtitle={`${currency(wastage.data?.netLoss ?? 0)} net · ${range.label}`}
            />
            {wastage.isLoading ? <LoadingState /> : (wastage.data?.byReason.length ?? 0) === 0 ? (
              <EmptyState icon="check_circle" title="Nothing written off" />
            ) : (
              <Table>
                <THead sort={reasonSort.sort} onSort={reasonSort.onSort}>
                  <TH sortKey="reason">Reason</TH>
                  <TH align="center" sortKey="unitsOut" sortDefault="desc">Units out</TH>
                  <TH align="right" sortKey="cost" sortDefault="desc">Cost</TH>
                </THead>
                <TBody>
                  {reasonSort.rows.map((w) => (
                    <TR key={w.reasonCode}>
                      <TD className="font-medium">
                        <span className="flex items-center gap-2">
                          <Icon
                            name={ADJUSTMENT_REASONS[w.reasonCode]?.icon ?? 'more_horiz'}
                            size={16}
                            className={w.isLoss ? 'text-error' : 'text-on-surface-variant'}
                          />
                          {w.reason}
                        </span>
                      </TD>
                      <TD align="center" className="font-mono-data">
                        {w.unitsOut.toLocaleString()}
                        {w.unitsIn > 0 && (
                          <span className="ml-1 text-[11px] text-secondary">
                            (+{w.unitsIn.toLocaleString()} back)
                          </span>
                        )}
                      </TD>
                      <TD align="right" className="font-mono-data font-semibold">{currency(w.cost)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>

          <Card className="lg:col-span-7 overflow-hidden">
            <CardHeader title="By Product" subtitle="What the losses eat" />
            {wastage.isLoading ? <LoadingState /> : (wastage.data?.byProduct.length ?? 0) === 0 ? (
              <EmptyState icon="inventory_2" title="Nothing written off" />
            ) : (
              <Table>
                <THead sort={wasteProductSort.sort} onSort={wasteProductSort.onSort}>
                  <TH sortKey="name">Product</TH>
                  <TH align="center" sortKey="units" sortDefault="desc">Units</TH>
                  <TH align="center" sortKey="entries" sortDefault="desc">Entries</TH>
                  <TH align="right" sortKey="cost" sortDefault="desc">Cost</TH>
                </THead>
                <TBody>
                  {wasteProductSort.rows.map((w) => (
                    <TR key={w.variantId}>
                      <TD className="font-medium">{w.name}</TD>
                      <TD align="center" className="font-mono-data">
                        {w.units.toLocaleString()} {w.baseUnit}
                      </TD>
                      <TD align="center" className="font-mono-data">{w.entries}</TD>
                      <TD align="right" className="font-mono-data font-semibold">{currency(w.cost)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>

          {/* The question a shop actually asks: which machine or job is
              eating the paper, and is it getting worse. */}
          <Card className="lg:col-span-5 overflow-hidden">
            <CardHeader title="By Job" subtitle="Losses recorded against a service" />
            {wastage.isLoading ? <LoadingState /> : (wastage.data?.byService.length ?? 0) === 0 ? (
              <EmptyState
                icon="print"
                title="Nothing recorded against a job"
                description="Wastage logged from the POS is attributed to the job it happened on."
              />
            ) : (
              <Table>
                <THead sort={wasteServiceSort.sort} onSort={wasteServiceSort.onSort}>
                  <TH sortKey="name">Service / option</TH>
                  <TH align="center" sortKey="units" sortDefault="desc">Units</TH>
                  <TH align="right" sortKey="cost" sortDefault="desc">Cost</TH>
                </THead>
                <TBody>
                  {wasteServiceSort.rows.map((w) => (
                    <TR key={w.serviceVariantId}>
                      <TD className="font-medium">{w.name}</TD>
                      <TD align="center" className="font-mono-data">{w.units.toLocaleString()}</TD>
                      <TD align="right" className="font-mono-data font-semibold">{currency(w.cost)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>

          <Card className="lg:col-span-7 overflow-hidden">
            <CardHeader title="Recent Entries" subtitle="Who wrote off what" />
            {wastageEntries.isLoading ? <LoadingState /> : (wastageEntries.data?.length ?? 0) === 0 ? (
              <EmptyState icon="history" title="No entries" />
            ) : (
              <Table>
                <THead sort={entriesSort.sort} onSort={entriesSort.onSort}>
                  <TH sortKey="createdAt" sortDefault="desc">When</TH>
                  <TH sortKey="name">Item</TH>
                  <TH align="center" sortKey="quantityChange" sortDefault="desc">Units</TH>
                  <TH align="right" sortKey="cost" sortDefault="desc">Cost</TH>
                  <TH sortKey="user">By</TH>
                </THead>
                <TBody>
                  {entriesSort.rows.map((w) => (
                    <TR key={w.id}>
                      <TD className="whitespace-nowrap text-on-surface-variant">{formatDateTime(w.createdAt)}</TD>
                      <TD>
                        <span className="font-medium">{w.name}</span>
                        <span className="block text-[11px] text-on-surface-variant">
                          {w.reason}
                          {w.service ? ` · ${w.service}` : ''}
                        </span>
                      </TD>
                      <TD
                        align="center"
                        className={cn(
                          'font-mono-data font-semibold',
                          w.quantityChange < 0 ? 'text-error' : 'text-secondary',
                        )}
                      >
                        {w.quantityChange > 0 ? '+' : ''}
                        {w.quantityChange.toLocaleString()}
                      </TD>
                      <TD align="right" className="font-mono-data">{currency(w.cost)}</TD>
                      <TD className="text-on-surface-variant">{w.user}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </div>
      )}

      {tab === 'cash' && (
        <Card className="overflow-hidden">
          <CardHeader title="Cash Sessions" subtitle="Recent reconciliations" />
          {cash.isLoading ? <LoadingState /> : (cash.data?.length ?? 0) === 0 ? <EmptyState icon="account_balance" title="No sessions" /> : (
            <Table>
              <THead sort={cashSort.sort} onSort={cashSort.onSort}>
                <TH sortKey="openedAt" sortDefault="desc">Opened</TH>
                <TH sortKey="user">Cashier</TH>
                <TH align="center" sortKey="status">Status</TH>
                <TH align="right" sortKey="expectedAmount" sortDefault="desc">Expected</TH>
                <TH align="right" sortKey="actualAmount" sortDefault="desc">Actual</TH>
                <TH align="right" sortKey="variance" sortDefault="desc">Variance</TH>
              </THead>
              <TBody>
                {cashSort.rows.map((s) => (
                  <TR key={s.id}>
                    <TD className="whitespace-nowrap text-on-surface-variant">{formatDateTime(s.openedAt)}</TD>
                    <TD className="font-medium">{s.user?.fullName ?? '—'}</TD>
                    <TD align="center">{s.status}</TD>
                    <TD align="right" className="font-mono-data">{s.expectedAmount ? currency(s.expectedAmount) : '—'}</TD>
                    <TD align="right" className="font-mono-data">{s.actualAmount ? currency(s.actualAmount) : '—'}</TD>
                    <TD align="right" className="font-mono-data">{s.variance != null ? currency(s.variance) : '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      )}

      {tab === 'staff' && (
        <Card className="overflow-hidden">
          <CardHeader title="Staff Activity" subtitle={`Sales performance · ${range.label}`} />
          {staff.isLoading ? <LoadingState /> : (staff.data?.length ?? 0) === 0 ? <EmptyState icon="groups" title="No activity" /> : (
            <Table>
              <THead sort={staffSort.sort} onSort={staffSort.onSort}>
                <TH sortKey="name">Staff</TH>
                <TH align="center" sortKey="role">Role</TH>
                <TH align="center" sortKey="sale_count" sortDefault="desc">Sales</TH>
                <TH align="right" sortKey="revenue" sortDefault="desc">Revenue</TH>
              </THead>
              <TBody>
                {staffSort.rows.map((u) => (
                  <TR key={u.userId}>
                    <TD className="font-medium">{u.name}</TD>
                    <TD align="center">{u.role}</TD>
                    <TD align="center" className="font-mono-data">{num(u.sale_count)}</TD>
                    <TD align="right" className="font-mono-data font-semibold">{currency(u.revenue)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      )}
    </div>
  );
}

const KPI_TONE = {
  neutral: 'text-on-surface',
  secondary: 'text-secondary',
  error: 'text-error',
  primary: 'text-primary',
} as const;

/**
 * One figure in the summary panel. The cells are separated by the grid's own
 * hairlines, so nothing here draws a border of its own; the icon rides beside
 * the label at text size rather than in a chip, which is what bought the room
 * the amounts needed.
 */
function KpiCell({
  label,
  value,
  icon,
  hint,
  tone = 'neutral',
  emphasis,
  loading,
  className,
}: {
  label: string;
  value: string;
  icon: string;
  hint?: string;
  tone?: keyof typeof KPI_TONE;
  /** The bottom line: heavier weight, not a larger size that would not fit. */
  emphasis?: boolean;
  loading?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('bg-surface-container-lowest p-4', className)}>
      <p className="flex items-center gap-1.5 text-body-sm font-medium text-on-surface-variant">
        <Icon name={icon} size={16} className={cn('shrink-0', KPI_TONE[tone])} />
        <span className="truncate">{label}</span>
      </p>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-28" />
      ) : (
        // Shilling amounts run long — "TZS 3,247,900" is already 13 characters
        // and grows with the shop — so the figure steps down a size on narrow
        // cells rather than being clipped. `title` keeps the full number
        // reachable if a future amount outgrows even that.
        <p
          className={cn(
            'mt-1 truncate text-body-lg sm:text-h3',
            emphasis ? 'font-bold' : 'font-semibold',
            KPI_TONE[tone],
          )}
          title={value}
        >
          {value}
        </p>
      )}
      {hint && !loading && (
        <p className="mt-0.5 truncate text-[12px] text-on-surface-variant">{hint}</p>
      )}
    </div>
  );
}

const DEBT_ACCENT = {
  secondary: 'text-secondary',
  error: 'text-error',
} as const;

/**
 * One line of the statement. `item` and `deduction` are the workings;
 * `subtotal` and `total` are the figures the shop actually quotes, so they get
 * the rule above them and the weight — nothing is boxed, or the card's own
 * border would be doubled by every group inside it.
 */
function StatementLine({ row }: { row: StatementRow }) {
  const rule = row.kind === 'subtotal' || row.kind === 'total';
  const total = row.kind === 'total';
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-4 py-2',
        rule && 'mt-1 border-t border-outline-variant pt-2.5',
        total && 'mt-1.5 border-t-2 border-outline pt-3',
      )}
    >
      <dt
        className={cn(
          'text-body-sm',
          row.kind === 'deduction' && 'pl-4 text-on-surface-variant',
          row.kind === 'item' && 'text-on-surface-variant',
          rule && 'font-semibold text-on-surface',
          total && 'text-body-lg',
        )}
      >
        {row.label}
      </dt>
      <dd
        className={cn(
          'shrink-0 font-mono-data',
          row.kind === 'deduction' ? 'text-error' : 'text-on-surface',
          rule && 'font-bold',
          total && 'text-h3 text-primary',
        )}
      >
        {row.value}
      </dd>
    </div>
  );
}

/** A supporting figure beside the ledger — ruled, never boxed. */
function StatementMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-outline-variant py-2.5 last:border-b-0">
      <dt className="text-body-sm text-on-surface-variant">{label}</dt>
      <dd className="font-mono-data font-semibold text-on-surface">{value}</dd>
    </div>
  );
}

function DebtTile({
  label,
  hint,
  value,
  accent,
  loading,
}: {
  label: string;
  hint: string;
  value: string;
  accent: keyof typeof DEBT_ACCENT;
  loading?: boolean;
}) {
  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2">
      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">
        {label}
      </p>
      {loading ? (
        <Skeleton className="mt-1.5 h-5 w-16" />
      ) : (
        <p className={cn('mt-0.5 truncate font-mono-data text-body-lg font-bold leading-tight', DEBT_ACCENT[accent])}>
          {value}
        </p>
      )}
      <p className="mt-0.5 truncate text-[10px] text-outline">{hint}</p>
    </div>
  );
}
