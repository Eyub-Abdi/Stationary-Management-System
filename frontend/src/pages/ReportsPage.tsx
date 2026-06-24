import { useMemo, useState } from 'react';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Icon,
  LoadingState,
  PageHeader,
  SegmentedControl,
  Skeleton,
  StatCard,
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
  useUserActivityReport,
} from '@/hooks/useReports';
import { useSupplierSummary } from '@/hooks/useCatalog';
import { useCustomerAging } from '@/hooks/useCustomers';
import { CHART_COLORS } from '@/lib/constants';
import {
  cn,
  currency,
  daysAgo,
  endOfToday,
  formatDate,
  formatDateTime,
  humanize,
  num,
  startOfMonth,
  startOfToday,
} from '@/lib/utils';

type RangeKey = 'today' | '7d' | '30d' | 'month';
type TabKey = 'financial' | 'sales' | 'expenses' | 'inventory' | 'cash' | 'staff';

function rangeFor(key: RangeKey): { from: string; to: string; label: string } {
  const to = endOfToday();
  switch (key) {
    case 'today':
      return { from: startOfToday(), to, label: 'Today' };
    case '7d':
      return { from: daysAgo(6), to, label: 'Last 7 days' };
    case '30d':
      return { from: daysAgo(29), to, label: 'Last 30 days' };
    case 'month':
      return { from: startOfMonth(), to, label: 'This month' };
  }
}

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
  const [rangeKey, setRangeKey] = useState<RangeKey>('7d');
  const [tab, setTab] = useState<TabKey>('financial');
  const range = rangeFor(rangeKey);
  const r = { from: range.from, to: range.to };

  const summary = useFinancialSummary(r);
  const series = useSalesSeries({ ...r, granularity: rangeKey === 'today' ? 'DAILY' : 'DAILY' });
  const expenseMix = useExpensesByCategory(r);
  const topProducts = useTopProducts(r, tab === 'sales' || tab === 'inventory');
  const stockLevels = useStockLevels(tab === 'inventory');
  const lowStock = useReportLowStock(tab === 'inventory');
  const cash = useCashReport(tab === 'cash');
  const staff = useUserActivityReport(r, tab === 'staff');

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
    () => (series.data ?? []).map((p) => ({ label: formatDate(p.period, 'dd MMM'), revenue: num(p.revenue), profit: num(p.grossProfit) })),
    [series.data],
  );
  const mixData = useMemo(
    () => (expenseMix.data ?? []).map((e) => ({ name: humanize(e.category), value: num(e.total) })),
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
            <SegmentedControl
              value={rangeKey}
              onChange={setRangeKey}
              items={[
                { value: 'today', label: 'Today' },
                { value: '7d', label: '7D' },
                { value: '30d', label: '30D' },
                { value: 'month', label: 'Month' },
              ]}
            />
            <Button variant="outline" icon="download" onClick={handleExport}>
              Export CSV
            </Button>
          </>
        }
      />

      {/* Summary KPIs always visible */}
      <div className="grid grid-cols-2 gap-gutter lg:grid-cols-4">
        <StatCard label="Revenue" icon="payments" accent="primary" loading={summary.isLoading} value={currency(summary.data?.revenue ?? 0)} hint={`${summary.data?.saleCount ?? 0} sales`} />
        <StatCard label="Gross Profit" icon="trending_up" accent="secondary" loading={summary.isLoading} value={currency(summary.data?.grossProfit ?? 0)} hint={`COGS ${currency(summary.data?.cogs ?? 0)}`} />
        <StatCard label="Expenses" icon="receipt_long" accent="error" loading={summary.isLoading} value={currency(summary.data?.expenses ?? 0)} />
        <StatCard label="Net Profit" icon="account_balance_wallet" accent="tertiary" loading={summary.isLoading} value={currency(summary.data?.netProfit ?? 0)} hint={range.label} />
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
          { value: 'cash', label: 'Cash', icon: 'account_balance' },
          { value: 'staff', label: 'Staff', icon: 'groups' },
        ]}
      />

      {tab === 'financial' && (
        <div className="grid grid-cols-1 gap-gutter lg:grid-cols-12">
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
        </div>
      )}

      {tab === 'sales' && (
        <div className="grid grid-cols-1 gap-gutter lg:grid-cols-12">
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
                <THead><TH>Product</TH><TH align="center">Units</TH><TH align="right">Revenue</TH></THead>
                <TBody>
                  {topProducts.data!.map((p) => (
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
        </div>
      )}

      {tab === 'expenses' && (
        <Card>
          <CardHeader title="Expenses by Category" subtitle={range.label} />
          {expenseMix.isLoading ? <LoadingState /> : mixData.length === 0 ? <EmptyState icon="pie_chart" title="No expenses" /> : (
            <Table>
              <THead><TH>Category</TH><TH align="center">Entries</TH><TH align="right">Total</TH><TH align="right">Share</TH></THead>
              <TBody>
                {expenseMix.data!.map((e) => (
                  <TR key={e.category}>
                    <TD className="font-medium">{humanize(e.category)}</TD>
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
                <THead><TH>Product</TH><TH align="center">Stock</TH><TH align="right">Value</TH></THead>
                <TBody>
                  {stockLevels.data!.map((s) => (
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
                <THead><TH>Product</TH><TH align="center">Current</TH><TH align="center">Min</TH></THead>
                <TBody>
                  {lowStock.data!.map((s) => (
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

      {tab === 'cash' && (
        <Card className="overflow-hidden">
          <CardHeader title="Cash Sessions" subtitle="Recent reconciliations" />
          {cash.isLoading ? <LoadingState /> : (cash.data?.length ?? 0) === 0 ? <EmptyState icon="account_balance" title="No sessions" /> : (
            <Table>
              <THead><TH>Opened</TH><TH>Cashier</TH><TH align="center">Status</TH><TH align="right">Expected</TH><TH align="right">Actual</TH><TH align="right">Variance</TH></THead>
              <TBody>
                {cash.data!.map((s) => (
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
              <THead><TH>Staff</TH><TH align="center">Role</TH><TH align="center">Sales</TH><TH align="right">Revenue</TH></THead>
              <TBody>
                {staff.data!.map((u) => (
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

const DEBT_ACCENT = {
  secondary: 'text-secondary',
  error: 'text-error',
} as const;

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
