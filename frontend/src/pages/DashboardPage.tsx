import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Icon,
  LoadingState,
  PageHeader,
  StatCard,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from '@/components/ui';
import { AreaTrendChart, DonutChart } from '@/components/charts/Charts';
import { DocLink } from '@/components/DocLink';
import { useAuth } from '@/providers/AuthProvider';
import { useActiveCashSession } from '@/providers/CashSessionProvider';
import { useSales } from '@/hooks/useSales';
import { useExpenses } from '@/hooks/useExpenses';
import { useCustomerAging } from '@/hooks/useCustomers';
import { useLowStockProducts } from '@/hooks/useProducts';
import { useExpensesByCategory, useFinancialSummary, useSalesSeries } from '@/hooks/useReports';
import {
  cn,
  currency,
  daysAgo,
  endOfToday,
  formatDate,
  humanize,
  num,
  startOfMonth,
  startOfToday,
  timeAgo,
} from '@/lib/utils';
import { CHART_COLORS, EXPENSE_CATEGORY_ICON } from '@/lib/constants';
import type { SaleStatus } from '@/types';

const STATUS_TONE: Record<SaleStatus, 'success' | 'error'> = {
  COMPLETED: 'success',
  VOIDED: 'error',
};

export default function DashboardPage() {
  const { user, isAdmin } = useAuth();
  const { session } = useActiveCashSession();
  const navigate = useNavigate();

  const todayRange = { from: startOfToday(), to: endOfToday() };
  const salesToday = useSales({ ...todayRange, limit: 100 });
  const expensesToday = useExpenses({ ...todayRange, limit: 100 }, isAdmin);
  const recentSales = useSales({ limit: 6 });
  const recentExpenses = useExpenses({ limit: 5 }, isAdmin);
  const lowStock = useLowStockProducts();
  // Receivables (what customers owe us) — surfaced for staff handling credit.
  const aging = useCustomerAging(!isAdmin);
  const receivablesTotal = useMemo(
    () => (aging.data ?? []).reduce((acc, r) => acc + num(r.balance), 0),
    [aging.data],
  );

  const summary = useFinancialSummary(todayRange, isAdmin);
  const series = useSalesSeries({ from: daysAgo(6), to: endOfToday(), granularity: 'DAILY' }, isAdmin);
  const expenseMix = useExpensesByCategory({ from: startOfMonth(), to: endOfToday() }, isAdmin);

  const todaySalesTotal = useMemo(
    () =>
      (salesToday.data?.data ?? [])
        .filter((s) => s.status === 'COMPLETED')
        .reduce((acc, s) => acc + num(s.total), 0),
    [salesToday.data],
  );
  const todayExpensesTotal = useMemo(
    () => (expensesToday.data?.data ?? []).reduce((acc, e) => acc + num(e.amount), 0),
    [expensesToday.data],
  );

  const chartData = useMemo(
    () =>
      (series.data ?? []).map((p) => ({
        label: formatDate(p.period, 'EEE'),
        revenue: num(p.revenue),
      })),
    [series.data],
  );

  const donutData = useMemo(
    () => (expenseMix.data ?? []).map((e) => ({ name: humanize(e.category), value: num(e.total) })),
    [expenseMix.data],
  );
  const donutTotal = donutData.reduce((a, b) => a + b.value, 0);

  return (
    <div className="flex flex-col gap-gutter">
      <PageHeader
        title={`${greeting()}, ${user?.fullName.split(' ')[0] ?? 'there'}`}
        description="Real-time overview of sales, expenses, and inventory health."
        actions={
          <>
            {isAdmin && (
              <Button variant="outline" icon="payments" onClick={() => navigate('/expenses')}>
                Add Expense
              </Button>
            )}
            <Button icon="point_of_sale" onClick={() => navigate('/pos')}>
              Start POS
            </Button>
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-gutter sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Today's Sales"
          accent="primary"
          icon="trending_up"
          loading={salesToday.isLoading}
          value={currency(todaySalesTotal)}
          hint={`${salesToday.data?.data.filter((s) => s.status === 'COMPLETED').length ?? 0} transactions`}
        />
        {isAdmin && (
          <StatCard
            label="Today's Expenses"
            accent="error"
            icon="payments"
            loading={expensesToday.isLoading}
            value={currency(todayExpensesTotal)}
            hint={`${expensesToday.data?.data.length ?? 0} vouchers`}
          />
        )}
        {isAdmin ? (
          <StatCard
            label="Today's Net Profit"
            accent="secondary"
            icon="account_balance_wallet"
            loading={summary.isLoading}
            value={currency(summary.data?.netProfit ?? 0)}
            hint={`Gross ${currency(summary.data?.grossProfit ?? 0)}`}
          />
        ) : (
          <StatCard
            label="Cash In Drawer"
            accent="secondary"
            icon="account_balance"
            value={session ? currency(session.breakdown?.expectedAmount ?? 0) : 'Closed'}
            hint={session ? 'Expected cash · session open' : 'No open session'}
          />
        )}
        {!isAdmin && (
          <StatCard
            label="Receivables"
            accent="error"
            icon="request_quote"
            loading={aging.isLoading}
            value={currency(receivablesTotal)}
            hint="Owed to us by customers"
          />
        )}
        <StatCard
          label="Low Stock Alerts"
          accent="tertiary"
          icon="inventory"
          loading={lowStock.isLoading}
          value={lowStock.data?.length ?? 0}
          footer={
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-container">
              <div
                className="h-full rounded-full bg-error"
                style={{ width: `${Math.min(100, (lowStock.data?.length ?? 0) * 8)}%` }}
              />
            </div>
          }
        />
      </div>

      {/* Charts (admin) */}
      {isAdmin && (
        <div className="grid grid-cols-1 gap-gutter lg:grid-cols-12">
          <Card className="lg:col-span-8">
            <CardHeader
              title="Weekly Sales Trend"
              subtitle="Completed revenue across the last 7 days"
            />
            <div className="px-4 pb-5">
              {series.isLoading ? (
                <LoadingState />
              ) : chartData.every((d) => d.revenue === 0) ? (
                <EmptyState icon="show_chart" title="No sales yet" description="Sales will appear here as they come in." />
              ) : (
                <AreaTrendChart data={chartData} xKey="label" yKey="revenue" color={CHART_COLORS[0]} />
              )}
            </div>
          </Card>

          <Card className="lg:col-span-4">
            <CardHeader title="Expense Mix" subtitle="This month by category" />
            <div className="px-6 pb-6">
              {expenseMix.isLoading ? (
                <LoadingState />
              ) : donutData.length === 0 ? (
                <EmptyState icon="donut_large" title="No expenses" description="Logged expenses appear here." />
              ) : (
                <>
                  <DonutChart data={donutData} centerLabel="Total" centerValue={currency(donutTotal)} />
                  <ul className="mt-4 space-y-2.5">
                    {donutData.slice(0, 5).map((d, i) => (
                      <li key={d.name} className="flex items-center justify-between text-body-sm">
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                          />
                          {d.name}
                        </span>
                        <span className="font-mono-data">
                          {donutTotal ? Math.round((d.value / donutTotal) * 100) : 0}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Tables */}
      <div className="grid grid-cols-1 gap-gutter lg:grid-cols-12">
        <Card className={cn('overflow-hidden', isAdmin ? 'lg:col-span-8' : 'lg:col-span-12')}>
          <CardHeader
            title="Recent Transactions"
            action={
              <Link to="/sales" className="text-body-sm font-semibold text-secondary hover:underline">
                View all
              </Link>
            }
          />
          {recentSales.isLoading ? (
            <LoadingState />
          ) : (recentSales.data?.data.length ?? 0) === 0 ? (
            <EmptyState icon="receipt_long" title="No transactions yet" description="Completed sales will show up here." />
          ) : (
            <Table>
              <THead>
                <TH>Invoice</TH>
                <TH>Cashier</TH>
                <TH align="right">Amount</TH>
                <TH align="center">Status</TH>
                <TH align="right">Time</TH>
              </THead>
              <TBody>
                {recentSales.data!.data.map((s) => (
                  <TR key={s.id}>
                    <TD>
                      <DocLink kind="sale" id={s.id}>{s.invoiceNumber}</DocLink>
                    </TD>
                    <TD>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={s.user?.fullName ?? '—'} size="xs" />
                        <span className="whitespace-nowrap font-medium text-on-surface">
                          {s.user?.fullName ?? '—'}
                        </span>
                      </div>
                    </TD>
                    <TD align="right" className="font-mono-data font-semibold">
                      {currency(s.total)}
                    </TD>
                    <TD align="center">
                      <Badge tone={STATUS_TONE[s.status]}>{humanize(s.status)}</Badge>
                    </TD>
                    <TD align="right" className="text-on-surface-variant">
                      {timeAgo(s.createdAt)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        {isAdmin && (
          <Card className="lg:col-span-4">
            <CardHeader title="Recent Expenses" />
            <div className="px-4 pb-4">
              {recentExpenses.isLoading ? (
                <LoadingState />
              ) : (recentExpenses.data?.data.length ?? 0) === 0 ? (
                <EmptyState icon="payments" title="No expenses" description="Expenses you record appear here." />
              ) : (
                <ul className="space-y-1">
                  {recentExpenses.data!.data.map((e) => (
                    <li
                      key={e.id}
                      className="flex items-center gap-3 rounded-xl border border-transparent p-3 transition-all hover:border-outline-variant hover:bg-surface-container-low"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-error-container text-error">
                        <Icon name={EXPENSE_CATEGORY_ICON[e.category]} size={20} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body-sm font-semibold text-on-surface">
                          {humanize(e.category)}
                        </p>
                        <p className="font-mono-data text-[11px] text-on-surface-variant">
                          {e.description?.slice(0, 28) || formatDate(e.expenseDate)} · {timeAgo(e.createdAt)}
                        </p>
                      </div>
                      <span className="font-mono-data text-body-sm font-bold text-error">
                        −{currency(e.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
