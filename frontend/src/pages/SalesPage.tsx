import { useEffect, useState } from 'react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Icon,
  Input,
  LoadingState,
  Modal,
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
  Textarea,
} from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { useReturnSale, useSale, useSales, useVoidSale } from '@/hooks/useSales';
import { extractMessage } from '@/lib/api';
import { currency, daysAgo, endOfToday, formatDateTime, humanize, num, startOfToday } from '@/lib/utils';
import type { Sale, SaleStatus } from '@/types';

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
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<SaleStatus | ''>('');
  const [rangeKey, setRangeKey] = useState<RangeKey>('all');
  const [detailId, setDetailId] = useState<string | null>(null);

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
                  <TR key={s.id} onClick={() => setDetailId(s.id)}>
                    <TD className="font-mono-data text-primary">{s.invoiceNumber}</TD>
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

      <SaleDetailModal id={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}

function SaleDetailModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { isAdmin } = useAuth();
  const { data: sale, isLoading } = useSale(id ?? undefined);
  const [returnOpen, setReturnOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);

  const isCompleted = sale?.status === 'COMPLETED';
  const returnable =
    sale?.items?.some((it) => it.quantity - it.returnedQuantity > 0) ?? false;

  return (
    <>
      <Modal
        open={!!id}
        onClose={onClose}
        size="lg"
        title={sale ? sale.invoiceNumber : 'Sale'}
        subtitle={sale ? `${formatDateTime(sale.createdAt)} · ${sale.user?.fullName ?? ''}` : undefined}
        footer={
          sale && isCompleted ? (
            <>
              {isAdmin && (
                <Button variant="danger" icon="block" onClick={() => setVoidOpen(true)}>
                  Void Sale
                </Button>
              )}
              <Button
                variant="outline"
                icon="undo"
                disabled={!returnable}
                onClick={() => setReturnOpen(true)}
              >
                Process Return
              </Button>
              <Button variant="subtle" icon="print" onClick={() => window.print()}>
                Print
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          )
        }
      >
        {isLoading || !sale ? (
          <LoadingState />
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <Badge tone={STATUS_TONE[sale.status]} dot>
                {humanize(sale.status)}
              </Badge>
              {sale.status === 'VOIDED' && sale.voidReason && (
                <span className="text-[13px] text-error">Voided: {sale.voidReason}</span>
              )}
            </div>

            <Card className="overflow-hidden">
              <Table>
                <THead>
                  <TH>Item</TH>
                  <TH align="center">Qty</TH>
                  <TH align="right">Unit</TH>
                  <TH align="right">Line total</TH>
                </THead>
                <TBody>
                  {sale.items?.map((it) => (
                    <TR key={it.id}>
                      <TD>
                        <div className="flex items-center gap-2">
                          <Icon
                            name={it.itemType === 'SERVICE' ? 'print' : 'inventory_2'}
                            size={18}
                            className="text-on-surface-variant"
                          />
                          <span className="font-medium">{it.nameSnapshot}</span>
                          {it.returnedQuantity > 0 && (
                            <Badge tone="warning">{it.returnedQuantity} returned</Badge>
                          )}
                        </div>
                      </TD>
                      <TD align="center" className="font-mono-data">
                        {it.quantity}
                        {it.pages ? ` × ${it.pages}p` : ''}
                      </TD>
                      <TD align="right" className="font-mono-data">{currency(it.unitPriceSnapshot)}</TD>
                      <TD align="right" className="font-mono-data font-semibold">{currency(it.lineTotal)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>

            <div className="ml-auto w-full max-w-xs space-y-1.5">
              <SummaryRow label="Subtotal" value={currency(sale.subtotal)} />
              {num(sale.discountTotal) > 0 && (
                <SummaryRow label="Discount" value={`−${currency(sale.discountTotal)}`} />
              )}
              <div className="flex items-center justify-between border-t border-outline-variant pt-1.5">
                <span className="text-body-sm font-semibold text-on-surface">Total</span>
                <span className="font-mono-data text-h3 font-bold text-primary">{currency(sale.total)}</span>
              </div>
              <SummaryRow label="Cash received" value={currency(sale.cashReceived)} />
              <SummaryRow label="Change given" value={currency(sale.changeGiven)} />
            </div>
          </div>
        )}
      </Modal>

      {sale && (
        <>
          <ReturnModal sale={sale} open={returnOpen} onClose={() => setReturnOpen(false)} onDone={onClose} />
          <VoidModal sale={sale} open={voidOpen} onClose={() => setVoidOpen(false)} onDone={onClose} />
        </>
      )}
    </>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-body-sm text-on-surface-variant">{label}</span>
      <span className="font-mono-data text-body-sm text-on-surface">{value}</span>
    </div>
  );
}

function ReturnModal({
  sale,
  open,
  onClose,
  onDone,
}: {
  sale: Sale;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const ret = useReturnSale();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) {
      setQty({});
      setReason('');
    }
  }, [open]);

  const lines = (sale.items ?? []).filter((it) => it.quantity - it.returnedQuantity > 0);

  const submit = async () => {
    const items = Object.entries(qty)
      .filter(([, q]) => q > 0)
      .map(([saleItemId, quantity]) => ({ saleItemId, quantity }));
    if (items.length === 0) return toast.error('Select at least one item to return');
    if (reason.trim().length < 5) return toast.error('Enter a reason (min 5 characters)');
    try {
      const result = await ret.mutateAsync({ id: sale.id, items, reason: reason.trim() });
      const credit = Number(result.creditApplied);
      const cash = Number(result.totalRefund) - credit;
      const detail =
        credit > 0
          ? `${currency(credit)} applied to balance${cash > 0 ? `, ${currency(cash)} cash refunded` : ''}. Stock restored.`
          : 'Refund recorded and stock restored.';
      toast.success('Return processed', detail);
      onClose();
      onDone();
    } catch (e) {
      toast.error('Return failed', extractMessage(e));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Process Return"
      subtitle={sale.invoiceNumber}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={ret.isPending}>
            Cancel
          </Button>
          <Button icon="undo" onClick={submit} loading={ret.isPending}>
            Process Return
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          {lines.map((it) => {
            const max = it.quantity - it.returnedQuantity;
            return (
              <div key={it.id} className="flex items-center gap-3 rounded-xl border border-outline-variant p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-sm font-semibold text-on-surface">{it.nameSnapshot}</p>
                  <p className="text-[12px] text-on-surface-variant">
                    {currency(it.unitPriceSnapshot)} · up to {max} returnable
                  </p>
                </div>
                <Input
                  type="number"
                  min={0}
                  max={max}
                  value={qty[it.id] ?? ''}
                  placeholder="0"
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(max, parseInt(e.target.value || '0', 10)));
                    setQty((p) => ({ ...p, [it.id]: v }));
                  }}
                  className="w-24"
                />
              </div>
            );
          })}
        </div>
        <Field label="Reason" required>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer returned 2 defective pens" />
        </Field>
      </div>
    </Modal>
  );
}

function VoidModal({
  sale,
  open,
  onClose,
  onDone,
}: {
  sale: Sale;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const voidSale = useVoidSale();
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  const submit = async () => {
    if (reason.trim().length < 5) return toast.error('Enter a reason (min 5 characters)');
    try {
      await voidSale.mutateAsync({ id: sale.id, reason: reason.trim() });
      toast.success('Sale voided', 'Inventory restored and reversal recorded.');
      onClose();
      onDone();
    } catch (e) {
      toast.error('Void failed', extractMessage(e));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Void Sale"
      subtitle={sale.invoiceNumber}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={voidSale.isPending}>
            Cancel
          </Button>
          <Button variant="danger" icon="block" onClick={submit} loading={voidSale.isPending}>
            Void Sale
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-xl border border-error/30 bg-error-container/40 px-4 py-3 text-on-error-container">
          <Icon name="warning" size={20} className="text-error" />
          <p className="text-body-sm">
            Voiding fully reverses this sale: inventory is restored and a reversal is recorded. This cannot be undone.
          </p>
        </div>
        <Field label="Reason" required>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this sale being voided?" />
        </Field>
      </div>
    </Modal>
  );
}
