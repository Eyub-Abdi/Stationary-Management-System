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
import { useSalesSeries } from '@/hooks/useReports';
import { useAuth } from '@/providers/AuthProvider';
import { extractMessage } from '@/lib/api';
import { currency, formatDate, formatDateTime, humanize, num } from '@/lib/utils';
import { rangeFor, toDateInput, type RangeKey } from '@/lib/dateRange';
import type { SaleStatus } from '@/types';

type ViewKey = 'transactions' | 'daily';

const STATUS_TONE: Record<SaleStatus, 'success' | 'error'> = {
  COMPLETED: 'success',
  VOIDED: 'error',
};

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
  const [view, setView] = useState<ViewKey>(() =>
    localStorage.getItem('sales-view') === 'daily' ? 'daily' : 'transactions',
  );
  useEffect(() => {
    localStorage.setItem('sales-view', view);
  }, [view]);
  // Never leave a non-reports user stuck on the (hidden) daily view.
  useEffect(() => {
    if (!canSeeDaily && view === 'daily') setView('transactions');
  }, [canSeeDaily, view]);

  const range = rangeFor(rangeKey, customFrom, customTo);
  const commonFilters = {
    search: search || undefined,
    status: status || undefined,
    ...range,
  };
  const { data, isLoading, isError, refetch, error } = useSales({
    page,
    limit: 15,
    ...commonFilters,
  });

  // Lightweight aggregate over the matching sales for the summary cards.
  const stats = useSales({ ...commonFilters, page: 1, limit: 100 });
  const statRows = stats.data?.data ?? [];
  const completed = statRows.filter((s) => s.status === 'COMPLETED');
  const revenue = completed.reduce((a, s) => a + num(s.total), 0);
  const voided = statRows.filter((s) => s.status === 'VOIDED').length;
  const txCount = stats.data?.meta.total ?? 0;
  const avgSale = completed.length ? revenue / completed.length : 0;

  // Per-day completed-sales totals for the "Daily totals" view (respects the date range).
  const daily = useSalesSeries(
    { granularity: 'DAILY', from: range.from, to: range.to },
    canSeeDaily && view === 'daily',
  );
  const dailyRows = daily.data ?? [];
  const dailyRevenue = dailyRows.reduce((a, r) => a + num(r.revenue), 0);
  const dailyCount = dailyRows.reduce((a, r) => a + r.saleCount, 0);
  const dailyExpenses = dailyRows.reduce((a, r) => a + num(r.expenses), 0);
  const dailyPurchases = dailyRows.reduce((a, r) => a + num(r.purchases), 0);

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
          loading={stats.isLoading}
          value={txCount.toLocaleString()}
          hint="Matching current filters"
        />
        <StatCard
          label="Revenue"
          icon="payments"
          accent="secondary"
          loading={stats.isLoading}
          value={currency(revenue)}
          hint={`${completed.length} completed`}
        />
        <StatCard
          label="Avg. Sale"
          icon="trending_up"
          accent="tertiary"
          loading={stats.isLoading}
          value={currency(avgSale)}
          hint="Per completed sale"
        />
        <StatCard
          label="Voided"
          icon="block"
          accent="error"
          loading={stats.isLoading}
          value={voided}
          hint="In current view"
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
                ]}
              />
            )}
            <Select
              value={rangeKey}
              onChange={(e) => {
                setRangeKey(e.target.value as RangeKey);
                setPage(1);
              }}
              className="w-40"
            >
              <option value="all">All time</option>
              <option value="today">Today</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="custom">Custom range</option>
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

        {view === 'daily' ? (
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
              <THead>
                <TH>Date</TH>
                <TH align="center">Transactions</TH>
                <TH align="right">Total sales</TH>
                <TH align="right">Expenses</TH>
                <TH align="right">Purchases</TH>
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
              <THead>
                <TH>Invoice</TH>
                <TH>Date &amp; time</TH>
                <TH>Cashier</TH>
                <TH align="center">Items</TH>
                <TH align="right">Total</TH>
                <TH align="center">Status</TH>
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
