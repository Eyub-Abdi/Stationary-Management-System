import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  LoadingState,
  PageHeader,
  SearchInput,
  SegmentedControl,
  StatCard,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from '@/components/ui';
import { useProductProfitability } from '@/hooks/useReports';
import { extractMessage } from '@/lib/api';
import {
  cn,
  currency,
  daysAgo,
  endOfToday,
  num,
  startOfMonth,
  startOfToday,
} from '@/lib/utils';
import type { ProductProfitRow } from '@/types';

type RangeKey = 'today' | '7d' | '30d' | 'month' | 'all';

function rangeFor(key: RangeKey): { from?: string; to?: string; label: string } {
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
    case 'all':
      return { label: 'All time' };
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

function marginTone(margin: number): 'success' | 'warning' | 'error' {
  if (margin >= 25) return 'success';
  if (margin >= 10) return 'warning';
  return 'error';
}

export default function ProfitPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>('30d');
  const [search, setSearch] = useState('');
  const range = rangeFor(rangeKey);
  const { data, isLoading, isError, error, refetch } = useProductProfitability({
    from: range.from,
    to: range.to,
  });

  const rows = data ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.name.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const totals = useMemo(() => {
    const revenue = rows.reduce((a, r) => a + num(r.revenue), 0);
    const cogs = rows.reduce((a, r) => a + num(r.cogs), 0);
    const profit = revenue - cogs;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    return { revenue, cogs, profit, margin };
  }, [rows]);

  return (
    <div className="flex flex-col gap-gutter">
      <PageHeader
        title="Profit Analysis"
        description="What each product earns — selling price vs. FIFO purchase cost, net of returns."
        actions={
          <Button
            variant="outline"
            icon="download"
            disabled={filtered.length === 0}
            onClick={() => exportCsv(`profit-${rangeKey}`, filtered as unknown as Record<string, unknown>[])}
          >
            Export CSV
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-gutter lg:grid-cols-4">
        <StatCard
          label="Revenue"
          icon="payments"
          accent="secondary"
          loading={isLoading}
          value={currency(totals.revenue)}
          hint={`${range.label} · net of returns`}
        />
        <StatCard
          label="Cost of Goods"
          icon="local_shipping"
          accent="tertiary"
          loading={isLoading}
          value={currency(totals.cogs)}
          hint="What we paid suppliers"
        />
        <StatCard
          label="Gross Profit"
          icon="trending_up"
          accent="primary"
          loading={isLoading}
          value={currency(totals.profit)}
          hint="Revenue − cost"
        />
        <StatCard
          label="Avg. Margin"
          icon="percent"
          accent={totals.margin >= 0 ? 'primary' : 'error'}
          loading={isLoading}
          value={`${totals.margin.toFixed(1)}%`}
          hint="Profit as % of revenue"
        />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-outline-variant p-4 lg:flex-row lg:items-center lg:justify-between">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by product or SKU…"
            className="lg:max-w-xs lg:flex-1"
          />
          <SegmentedControl
            value={rangeKey}
            onChange={setRangeKey}
            items={[
              { value: 'today', label: 'Today' },
              { value: '7d', label: '7d' },
              { value: '30d', label: '30d' },
              { value: 'month', label: 'Month' },
              { value: 'all', label: 'All' },
            ]}
          />
        </div>

        {isLoading ? (
          <LoadingState label="Crunching profit…" />
        ) : isError ? (
          <ErrorState message={extractMessage(error)} onRetry={refetch} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="trending_up"
            title="No sales yet"
            description="Once products sell in this period, their profit appears here."
          />
        ) : (
          <Table>
            <THead>
              <TH>Product</TH>
              <TH align="right">Sold</TH>
              <TH align="right">Unit cost</TH>
              <TH align="right">Unit price</TH>
              <TH align="right">Revenue</TH>
              <TH align="right">Cost</TH>
              <TH align="right">Profit</TH>
              <TH align="center">Margin</TH>
            </THead>
            <TBody>
              {filtered.map((r) => (
                <ProfitRow key={r.productId} row={r} />
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function ProfitRow({ row }: { row: ProductProfitRow }) {
  const margin = num(row.margin);
  const profit = num(row.grossProfit);
  const hasBulk = !!row.bulkUnit && row.unitSize > 1;

  return (
    <TR>
      <TD>
        <div className="flex flex-col">
          <span className="font-semibold text-on-surface">{row.name}</span>
          <span className="font-mono-data text-[11px] text-on-surface-variant">{row.sku}</span>
        </div>
      </TD>
      <TD align="right">
        <div className="flex flex-col items-end">
          <span className="font-mono-data font-semibold">
            {row.qtyBase.toLocaleString()} {row.baseUnit}
          </span>
          {hasBulk && (row.wholesaleUnits > 0 || row.retailUnits > 0) && (
            <span className="text-[11px] text-on-surface-variant">
              {row.wholesaleUnits > 0 && `${row.wholesaleUnits} ${row.bulkUnit}`}
              {row.wholesaleUnits > 0 && row.retailUnits > 0 && ' · '}
              {row.retailUnits > 0 && `${row.retailUnits} ${row.baseUnit}`}
            </span>
          )}
        </div>
      </TD>
      <TD align="right" className="font-mono-data text-on-surface-variant">
        {currency(row.buyingPrice)}
      </TD>
      <TD align="right">
        <div className="flex flex-col items-end font-mono-data">
          <span>{currency(row.sellingPrice)}</span>
          {hasBulk && (
            <span className="text-[11px] text-on-surface-variant">
              {currency(row.bulkSellingPrice ?? num(row.sellingPrice) * row.unitSize)}/{row.bulkUnit}
            </span>
          )}
        </div>
      </TD>
      <TD align="right" className="font-mono-data">{currency(row.revenue)}</TD>
      <TD align="right" className="font-mono-data text-on-surface-variant">{currency(row.cogs)}</TD>
      <TD
        align="right"
        className={cn('font-mono-data font-semibold', profit >= 0 ? 'text-on-surface' : 'text-error')}
      >
        {currency(profit)}
      </TD>
      <TD align="center">
        <Badge tone={marginTone(margin)}>
          <Icon name={profit >= 0 ? 'trending_up' : 'trending_down'} size={13} />
          {margin.toFixed(1)}%
        </Badge>
      </TD>
    </TR>
  );
}
