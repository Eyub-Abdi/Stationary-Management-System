import { useMemo, useState } from 'react';
import {
  Badge,
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
  Tabs,
} from '@/components/ui';
import { useProductMovement } from '@/hooks/useReports';
import { extractMessage } from '@/lib/api';
import { cn, daysAgo, endOfToday, formatDate } from '@/lib/utils';
import type { ProductMovementRow } from '@/types';

type RangeKey = '7d' | '30d' | '90d';
type MoveClass = 'FAST' | 'MEDIUM' | 'SLOW' | 'DEAD';
type FilterKey = 'all' | MoveClass;

function rangeFor(key: RangeKey): { from: string; to: string; days: number; label: string } {
  const to = endOfToday();
  switch (key) {
    case '7d':
      return { from: daysAgo(6), to, days: 7, label: 'Last 7 days' };
    case '30d':
      return { from: daysAgo(29), to, days: 30, label: 'Last 30 days' };
    case '90d':
      return { from: daysAgo(89), to, days: 90, label: 'Last 90 days' };
  }
}

const CLASS_META: Record<MoveClass, { label: string; tone: 'success' | 'info' | 'warning' | 'error'; icon: string }> = {
  FAST: { label: 'Fast', tone: 'success', icon: 'bolt' },
  MEDIUM: { label: 'Medium', tone: 'info', icon: 'trending_flat' },
  SLOW: { label: 'Slow', tone: 'warning', icon: 'trending_down' },
  DEAD: { label: 'Dead', tone: 'error', icon: 'do_not_disturb_on' },
};

interface Enriched extends ProductMovementRow {
  klass: MoveClass;
  velocity: number; // base units per day
  daysOfCover: number | null; // how long current stock lasts at this velocity
  daysSinceSold: number | null;
}

function daysBetween(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/**
 * Classify movers relative to this shop's own volume: sellers are ranked by
 * units sold and split into thirds (fast / medium / slow); anything with no
 * sales in the range is dead stock.
 */
function classify(rows: ProductMovementRow[], days: number): Enriched[] {
  const sellers = rows.filter((r) => r.unitsSold > 0).sort((a, b) => b.unitsSold - a.unitsSold);
  const n = sellers.length;
  const klassOf = new Map<string, MoveClass>();
  sellers.forEach((r, i) => {
    const frac = i / n;
    klassOf.set(r.productId, frac < 1 / 3 ? 'FAST' : frac < 2 / 3 ? 'MEDIUM' : 'SLOW');
  });

  return rows.map((r) => {
    const klass = r.unitsSold > 0 ? klassOf.get(r.productId)! : 'DEAD';
    const velocity = r.unitsSold / days;
    const daysOfCover = velocity > 0 ? Math.round(r.currentStock / velocity) : null;
    return {
      ...r,
      klass,
      velocity,
      daysOfCover,
      daysSinceSold: r.lastSoldAt ? daysBetween(r.lastSoldAt) : null,
    };
  });
}

export default function MovementPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>('30d');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const range = rangeFor(rangeKey);
  const { data, isLoading, isError, error, refetch } = useProductMovement({
    from: range.from,
    to: range.to,
  });

  const enriched = useMemo(() => classify(data ?? [], range.days), [data, range.days]);

  const counts = useMemo(() => {
    const c: Record<MoveClass, number> = { FAST: 0, MEDIUM: 0, SLOW: 0, DEAD: 0 };
    enriched.forEach((r) => (c[r.klass] += 1));
    return c;
  }, [enriched]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched
      .filter((r) => filter === 'all' || r.klass === filter)
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q));
  }, [enriched, filter, search]);

  // Dead stock with units sitting on the shelf is the costly case — surface it.
  const deadWithStock = enriched.filter((r) => r.klass === 'DEAD' && r.currentStock > 0).length;

  return (
    <div className="flex flex-col gap-gutter">
      <PageHeader
        title="Product Movement"
        description="How fast each product sells — spot best sellers, slow movers and dead stock."
      />

      <div className="grid grid-cols-2 gap-gutter lg:grid-cols-4">
        <StatCard label="Fast movers" icon="bolt" accent="secondary" loading={isLoading} value={counts.FAST} hint={range.label} />
        <StatCard label="Slow movers" icon="trending_down" accent="tertiary" loading={isLoading} value={counts.SLOW} hint="Selling, but rarely" />
        <StatCard label="Dead stock" icon="do_not_disturb_on" accent="error" loading={isLoading} value={counts.DEAD} hint={`${deadWithStock} still in stock`} />
        <StatCard label="Active products" icon="inventory_2" accent="primary" loading={isLoading} value={enriched.length} hint="In catalogue" />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-outline-variant p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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
                { value: '7d', label: '7d' },
                { value: '30d', label: '30d' },
                { value: '90d', label: '90d' },
              ]}
            />
          </div>
          <Tabs
            value={filter}
            onChange={(v) => setFilter(v as FilterKey)}
            items={[
              { value: 'all', label: 'All', count: enriched.length },
              { value: 'FAST', label: 'Fast', count: counts.FAST },
              { value: 'MEDIUM', label: 'Medium', count: counts.MEDIUM },
              { value: 'SLOW', label: 'Slow', count: counts.SLOW },
              { value: 'DEAD', label: 'Dead', count: counts.DEAD },
            ]}
          />
        </div>

        {isLoading ? (
          <LoadingState label="Measuring movement…" />
        ) : isError ? (
          <ErrorState message={extractMessage(error)} onRetry={refetch} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon="insights"
            title="Nothing here"
            description="No products match this filter for the selected period."
          />
        ) : (
          <Table>
            <THead>
              <TH>Product</TH>
              <TH align="center">Movement</TH>
              <TH align="right">Sold</TH>
              <TH align="right">Per day</TH>
              <TH align="right">In stock</TH>
              <TH align="right">Days of cover</TH>
              <TH align="right">Last sold</TH>
            </THead>
            <TBody>
              {visible.map((r) => (
                <MovementRow key={r.productId} row={r} />
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function MovementRow({ row }: { row: Enriched }) {
  const meta = CLASS_META[row.klass];
  // Low cover on a mover = reorder soon; flag it.
  const lowCover = row.daysOfCover != null && row.klass !== 'DEAD' && row.daysOfCover <= 7;

  return (
    <TR>
      <TD>
        <div className="flex flex-col">
          <span className="font-semibold text-on-surface">{row.name}</span>
          <span className="font-mono-data text-[11px] text-on-surface-variant">{row.sku}</span>
        </div>
      </TD>
      <TD align="center">
        <Badge tone={meta.tone}>
          <Icon name={meta.icon} size={13} />
          {meta.label}
        </Badge>
      </TD>
      <TD align="right" className="font-mono-data font-semibold">
        {row.unitsSold.toLocaleString()} {row.baseUnit}
      </TD>
      <TD align="right" className="font-mono-data text-on-surface-variant">
        {row.velocity > 0 ? row.velocity.toFixed(row.velocity < 1 ? 2 : 1) : '—'}
      </TD>
      <TD align="right" className={cn('font-mono-data', row.currentStock <= 0 && 'text-error')}>
        {row.currentStock.toLocaleString()}
      </TD>
      <TD align="right" className="font-mono-data">
        {row.daysOfCover == null ? (
          <span className="text-on-surface-variant">—</span>
        ) : (
          <span className={cn(lowCover && 'font-semibold text-error')}>
            {row.daysOfCover}d{lowCover && ' ⚠'}
          </span>
        )}
      </TD>
      <TD align="right" className="whitespace-nowrap text-on-surface-variant">
        {row.lastSoldAt ? (
          <span title={formatDate(row.lastSoldAt, 'dd MMM yyyy')}>
            {row.daysSinceSold === 0 ? 'Today' : `${row.daysSinceSold}d ago`}
          </span>
        ) : (
          <span className="text-error">Never</span>
        )}
      </TD>
    </TR>
  );
}
