import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  Input,
  LoadingState,
  PageHeader,
  Pagination,
  RangeOptions,
  SearchInput,
  SegmentedControl,
  Select,
  StatCard,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from '@/components/ui';
import { DocLink } from '@/components/DocLink';
import { useSales } from '@/hooks/useSales';
import { useClientSort, useTableSort } from '@/hooks/useSort';
import { useSalesSeries } from '@/hooks/useReports';
import { useAuth } from '@/providers/AuthProvider';
import { extractMessage } from '@/lib/api';
import { PAGE_SIZE } from '@/lib/constants';
import { cn, currency, formatDate, formatDateTime, humanize, num } from '@/lib/utils';
import { monthKeyOf, rangeFor, toDateInput, type RangeKey } from '@/lib/dateRange';
import type { SalesSeriesPoint, SaleStatus } from '@/types';

type ViewKey = 'transactions' | 'daily' | 'monthly';

const STATUS_TONE: Record<SaleStatus, 'success' | 'error'> = {
  COMPLETED: 'success',
  VOIDED: 'error',
};

/** What the month actually left behind: gross profit less what was spent
 *  running the shop and less stock spoiled. Purchases are not subtracted —
 *  buying stock moves money into inventory, it does not consume it. Matches
 *  the net profit on the Reports and month-end statements. */
function monthNet(r: SalesSeriesPoint): number {
  return num(r.grossProfit) - num(r.expenses) - num(r.stockLoss);
}

export default function SalesPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const canSeeDaily = can('reports');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<SaleStatus | ''>('');
  const [rangeKey, setRangeKey] = useState<RangeKey>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [view, setView] = useState<ViewKey>(() => {
    const saved = localStorage.getItem('sales-view');
    return saved === 'daily' || saved === 'monthly' ? saved : 'transactions';
  });
  useEffect(() => {
    localStorage.setItem('sales-view', view);
  }, [view]);
  // Never leave a non-reports user stuck on the (hidden) daily view.
  useEffect(() => {
    if (!canSeeDaily && view !== 'transactions') setView('transactions');
  }, [canSeeDaily, view]);

  const range = rangeFor(rangeKey, customFrom, customTo);
  const commonFilters = {
    search: search || undefined,
    status: status || undefined,
    ...range,
  };
  const sales = useTableSort({ by: 'createdAt', dir: 'desc' }, () => setPage(1));
  const { data, isLoading, isError, refetch, error } = useSales({
    page,
    limit: PAGE_SIZE,
    ...sales.params,
    ...commonFilters,
  });

  // The API totals every sale the filters match. Adding up the rows on screen
  // would only ever describe the current page.
  const summary = data?.summary;
  const revenue = num(summary?.revenue ?? 0);
  const completedCount = summary?.completedCount ?? 0;
  const voided = summary?.voidedCount ?? 0;
  const txCount = data?.meta.total ?? 0;
  const avgSale = num(summary?.averageSale ?? 0);

  // Per-day completed-sales totals for the "Daily totals" view (respects the date range).
  const daily = useSalesSeries(
    { granularity: 'DAILY', from: range.from, to: range.to },
    canSeeDaily && view === 'daily',
  );
  // salesSeries comes back oldest-first (for charts); show newest day on top here.
  const dailySort = useClientSort(daily.data, { by: 'period', dir: 'desc' }, {
    period: (r) => r.period,
    saleCount: (r) => r.saleCount,
    revenue: (r) => num(r.revenue),
    expenses: (r) => num(r.expenses),
    purchases: (r) => num(r.purchases),
  });
  const dailyRows = dailySort.rows;
  const dailyRevenue = dailyRows.reduce((a, r) => a + num(r.revenue), 0);
  const dailyCount = dailyRows.reduce((a, r) => a + r.saleCount, 0);
  const dailyExpenses = dailyRows.reduce((a, r) => a + num(r.expenses), 0);
  const dailyPurchases = dailyRows.reduce((a, r) => a + num(r.purchases), 0);

  // Per-month totals. Same series, bucketed monthly — "what did we do in June".
  const monthly = useSalesSeries(
    { granularity: 'MONTHLY', from: range.from, to: range.to },
    canSeeDaily && view === 'monthly',
  );
  const monthlySort = useClientSort(monthly.data, { by: 'period', dir: 'desc' }, {
    period: (r) => r.period,
    saleCount: (r) => r.saleCount,
    revenue: (r) => num(r.revenue),
    grossProfit: (r) => num(r.grossProfit),
    expenses: (r) => num(r.expenses),
    purchases: (r) => num(r.purchases),
    net: (r) => monthNet(r),
  });
  const monthlyRows = monthlySort.rows;
  const monthlyTotals = monthlyRows.reduce(
    (a, r) => ({
      count: a.count + r.saleCount,
      revenue: a.revenue + num(r.revenue),
      grossProfit: a.grossProfit + num(r.grossProfit),
      expenses: a.expenses + num(r.expenses),
      purchases: a.purchases + num(r.purchases),
      net: a.net + monthNet(r),
    }),
    { count: 0, revenue: 0, grossProfit: 0, expenses: 0, purchases: 0, net: 0 },
  );

  // Every month the shop has traded, for the range picker. Deliberately NOT
  // filtered by the current range — otherwise picking June would shrink the
  // list to June and there would be no way back to July.
  const tradedMonths = useSalesSeries({ granularity: 'MONTHLY' }, canSeeDaily);
  const monthChoices = [...(tradedMonths.data ?? [])]
    .map((p) => monthKeyOf(p.period))
    .filter((k): k is RangeKey => !!k)
    .reverse();

  // Drill from a month into its days, which then drill into transactions.
  const openMonth = (period: string) => {
    const key = monthKeyOf(period);
    if (!key) return;
    setRangeKey(key);
    setStatus('');
    setSearch('');
    setPage(1);
    setView('daily');
  };

  // Drill into a single day: filter the transactions list to that date.
  const openDay = (period: string) => {
    const day = toDateInput(period);
    if (!day) return;
    setCustomFrom(day);
    setCustomTo(day);
    setRangeKey('custom');
    setStatus('');
    setSearch('');
    setPage(1);
    setView('transactions');
  };

  return (
    <div className="flex flex-col gap-gutter">
      <PageHeader title="Sales" description="Browse, search and inspect every transaction — including returns and voids." />

      <div className="grid grid-cols-2 gap-gutter lg:grid-cols-4">
        <StatCard
          label="Transactions"
          icon="receipt_long"
          accent="primary"
          loading={isLoading}
          value={txCount.toLocaleString()}
          hint="Matching current filters"
        />
        <StatCard
          label="Revenue"
          icon="payments"
          accent="secondary"
          loading={isLoading}
          value={currency(revenue)}
          hint={`${completedCount} completed`}
        />
        <StatCard
          label="Avg. Sale"
          icon="trending_up"
          accent="tertiary"
          loading={isLoading}
          value={currency(avgSale)}
          hint="Per completed sale"
        />
        <StatCard
          label="Voided"
          icon="block"
          accent="error"
          loading={isLoading}
          value={voided}
          hint="Excluded from revenue"
        />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-outline-variant p-4 lg:flex-row lg:items-center">
          {view === 'transactions' ? (
            <SearchInput
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder="Search by invoice, transaction # or cashier…"
              className="flex-1"
            />
          ) : (
            <div className="flex-1" />
          )}
          <div className="flex flex-wrap items-center gap-3">
            {canSeeDaily && (
              <SegmentedControl<ViewKey>
                value={view}
                onChange={setView}
                items={[
                  { value: 'transactions', label: 'Transactions' },
                  { value: 'daily', label: 'Daily totals' },
                  { value: 'monthly', label: 'Monthly totals' },
                ]}
              />
            )}
            <Select
              value={rangeKey}
              onChange={(e) => {
                setRangeKey(e.target.value as RangeKey);
                setPage(1);
              }}
              className="w-44"
            >
              <RangeOptions months={monthChoices} />
            </Select>
            {rangeKey === 'custom' && (
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  aria-label="From date"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={(e) => {
                    setCustomFrom(e.target.value);
                    setPage(1);
                  }}
                  className="w-40"
                />
                <span className="text-on-surface-variant">–</span>
                <Input
                  type="date"
                  aria-label="To date"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={(e) => {
                    setCustomTo(e.target.value);
                    setPage(1);
                  }}
                  className="w-40"
                />
              </div>
            )}
            {view === 'transactions' && (
              <Select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as SaleStatus | '');
                  setPage(1);
                }}
                className="w-36"
              >
                <option value="">All status</option>
                <option value="COMPLETED">Completed</option>
                <option value="VOIDED">Voided</option>
              </Select>
            )}
          </div>
        </div>

        {view === 'monthly' ? (
          monthly.isLoading ? (
            <LoadingState label="Loading monthly totals…" />
          ) : monthly.isError ? (
            <ErrorState message={extractMessage(monthly.error)} onRetry={monthly.refetch} />
          ) : monthlyRows.length === 0 ? (
            <EmptyState
              icon="calendar_month"
              title="No sales in this range"
              description="Pick a different date range to see monthly totals."
            />
          ) : (
            <Table>
              <THead sort={monthlySort.sort} onSort={monthlySort.onSort}>
                <TH sortKey="period" sortDefault="desc">Month</TH>
                <TH align="center" sortKey="saleCount" sortDefault="desc">Transactions</TH>
                <TH align="right" sortKey="revenue" sortDefault="desc">Total sales</TH>
                <TH align="right" sortKey="grossProfit" sortDefault="desc">Gross profit</TH>
                <TH align="right" sortKey="expenses" sortDefault="desc">Expenses</TH>
                <TH align="right" sortKey="purchases" sortDefault="desc">Purchases</TH>
                <TH align="right" sortKey="net" sortDefault="desc">Net profit</TH>
                <TH align="right">Action</TH>
              </THead>
              <TBody>
                {monthlyRows.map((r) => {
                  const net = monthNet(r);
                  return (
                    <TR key={r.period} onClick={() => openMonth(r.period)}>
                      <TD className="whitespace-nowrap font-medium">
                        {formatDate(r.period, 'MMMM yyyy')}
                      </TD>
                      <TD align="center" className="font-mono-data">{r.saleCount}</TD>
                      <TD align="right" className="font-mono-data font-semibold">{currency(r.revenue)}</TD>
                      <TD align="right" className="font-mono-data">{currency(r.grossProfit)}</TD>
                      <TD align="right" className="font-mono-data">
                        {num(r.expenses) ? (
                          <span className="text-error">−{currency(r.expenses)}</span>
                        ) : (
                          <span className="text-on-surface-variant">—</span>
                        )}
                      </TD>
                      <TD align="right" className="font-mono-data">
                        {num(r.purchases) ? currency(r.purchases) : <span className="text-on-surface-variant">—</span>}
                      </TD>
                      <TD
                        align="right"
                        className={cn(
                          'font-mono-data font-bold',
                          net < 0 ? 'text-error' : 'text-on-surface',
                        )}
                      >
                        {net < 0 ? `−${currency(Math.abs(net))}` : currency(net)}
                      </TD>
                      <TD align="right">
                        <Icon name="chevron_right" size={20} className="text-on-surface-variant" />
                      </TD>
                    </TR>
                  );
                })}
                <TR className="bg-surface-container-low">
                  <TD className="font-semibold">Total</TD>
                  <TD align="center" className="font-mono-data font-semibold">{monthlyTotals.count}</TD>
                  <TD align="right" className="font-mono-data font-semibold">{currency(monthlyTotals.revenue)}</TD>
                  <TD align="right" className="font-mono-data font-semibold">{currency(monthlyTotals.grossProfit)}</TD>
                  <TD align="right" className="font-mono-data font-semibold text-error">
                    −{currency(monthlyTotals.expenses)}
                  </TD>
                  <TD align="right" className="font-mono-data font-semibold">{currency(monthlyTotals.purchases)}</TD>
                  <TD align="right" className="font-mono-data font-bold">
                    {monthlyTotals.net < 0
                      ? `−${currency(Math.abs(monthlyTotals.net))}`
                      : currency(monthlyTotals.net)}
                  </TD>
                  <TD />
                </TR>
              </TBody>
            </Table>
          )
        ) : view === 'daily' ? (
          daily.isLoading ? (
            <LoadingState label="Loading daily totals…" />
          ) : daily.isError ? (
            <ErrorState message={extractMessage(daily.error)} onRetry={daily.refetch} />
          ) : dailyRows.length === 0 ? (
            <EmptyState
              icon="calendar_month"
              title="No sales in this range"
              description="Pick a different date range to see daily totals."
            />
          ) : (
            <Table>
              <THead sort={dailySort.sort} onSort={dailySort.onSort}>
                <TH sortKey="period" sortDefault="desc">Date</TH>
                <TH align="center" sortKey="saleCount" sortDefault="desc">Transactions</TH>
                <TH align="right" sortKey="revenue" sortDefault="desc">Total sales</TH>
                <TH align="right" sortKey="expenses" sortDefault="desc">Expenses</TH>
                <TH align="right" sortKey="purchases" sortDefault="desc">Purchases</TH>
                <TH align="right">Action</TH>
              </THead>
              <TBody>
                {dailyRows.map((r) => {
                  const day = toDateInput(r.period);
                  return (
                  <TR key={r.period} onClick={() => openDay(r.period)}>
                    <TD className="whitespace-nowrap font-medium">{formatDate(r.period)}</TD>
                    <TD align="center" className="font-mono-data">{r.saleCount}</TD>
                    <TD align="right" className="font-mono-data font-semibold">{currency(r.revenue)}</TD>
                    <TD align="right" className="font-mono-data">
                      {num(r.expenses) ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/expenses?date=${day}`);
                          }}
                          className="font-semibold text-error underline-offset-2 hover:underline"
                        >
                          {currency(r.expenses)}
                        </button>
                      ) : (
                        <span className="text-on-surface-variant">—</span>
                      )}
                    </TD>
                    <TD align="right" className="font-mono-data">
                      {num(r.purchases) ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/purchases?date=${day}`);
                          }}
                          className="font-semibold text-on-surface underline-offset-2 hover:underline"
                        >
                          {currency(r.purchases)}
                        </button>
                      ) : (
                        <span className="text-on-surface-variant">—</span>
                      )}
                    </TD>
                    <TD align="right">
                      <Icon name="chevron_right" size={20} className="text-on-surface-variant" />
                    </TD>
                  </TR>
                  );
                })}
                <TR className="bg-surface-container-low">
                  <TD className="font-semibold">Total</TD>
                  <TD align="center" className="font-mono-data font-semibold">{dailyCount}</TD>
                  <TD align="right" className="font-mono-data font-semibold">{currency(dailyRevenue)}</TD>
                  <TD align="right" className="font-mono-data font-semibold">{currency(dailyExpenses)}</TD>
                  <TD align="right" className="font-mono-data font-semibold">{currency(dailyPurchases)}</TD>
                  <TD />
                </TR>
              </TBody>
            </Table>
          )
        ) : isLoading ? (
          <LoadingState label="Loading sales…" />
        ) : isError ? (
          <ErrorState message={extractMessage(error)} onRetry={refetch} />
        ) : data!.data.length === 0 ? (
          <EmptyState
            icon="receipt_long"
            title="No sales found"
            description="Completed sales from the POS will appear here."
          />
        ) : (
          <>
            <Table>
              <THead sort={sales.sort} onSort={sales.onSort}>
                <TH sortKey="invoiceNumber">Invoice</TH>
                <TH sortKey="createdAt" sortDefault="desc">Date &amp; time</TH>
                <TH sortKey="cashier">Cashier</TH>
                <TH align="center" sortKey="items" sortDefault="desc">Items</TH>
                <TH align="right" sortKey="total" sortDefault="desc">Total</TH>
                <TH align="center" sortKey="status">Status</TH>
                <TH align="right">Action</TH>
              </THead>
              <TBody>
                {data!.data.map((s) => (
                  <TR key={s.id} onClick={() => navigate(`/sales/${s.id}`)}>
                    <TD>
                      <DocLink kind="sale" id={s.id}>{s.invoiceNumber}</DocLink>
                    </TD>
                    <TD className="whitespace-nowrap text-on-surface-variant">{formatDateTime(s.createdAt)}</TD>
                    <TD>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={s.user?.fullName ?? '—'} size="xs" />
                        <span className="whitespace-nowrap">{s.user?.fullName ?? '—'}</span>
                      </div>
                    </TD>
                    <TD align="center" className="font-mono-data">{s._count?.items ?? '—'}</TD>
                    <TD align="right" className="font-mono-data font-semibold">{currency(s.total)}</TD>
                    <TD align="center">
                      <Badge tone={STATUS_TONE[s.status]}>{humanize(s.status)}</Badge>
                    </TD>
                    <TD align="right">
                      <Icon name="chevron_right" size={20} className="text-on-surface-variant" />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination meta={data!.meta} onPage={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
