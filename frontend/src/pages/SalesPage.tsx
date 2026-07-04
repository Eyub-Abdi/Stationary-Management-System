import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  LoadingState,
  PageHeader,
  Pagination,
  SearchInput,
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
import { extractMessage } from '@/lib/api';
import { currency, daysAgo, endOfToday, formatDateTime, humanize, num, startOfToday } from '@/lib/utils';
import type { SaleStatus } from '@/types';

const STATUS_TONE: Record<SaleStatus, 'success' | 'error'> = {
  COMPLETED: 'success',
  VOIDED: 'error',
};

type RangeKey = 'all' | 'today' | '7d' | '30d';

function rangeFor(key: RangeKey): { from?: string; to?: string } {
  switch (key) {
    case 'today':
      return { from: startOfToday(), to: endOfToday() };
    case '7d':
      return { from: daysAgo(6), to: endOfToday() };
    case '30d':
      return { from: daysAgo(29), to: endOfToday() };
    default:
      return {};
  }
}

export default function SalesPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<SaleStatus | ''>('');
  const [rangeKey, setRangeKey] = useState<RangeKey>('all');

  const range = rangeFor(rangeKey);
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
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search by invoice, transaction # or cashier…"
            className="flex-1"
          />
          <div className="flex flex-wrap items-center gap-3">
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
            </Select>
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
          </div>
        </div>

        {isLoading ? (
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
