import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Badge,
  Breadcrumbs,
  Button,
  Card,
  ErrorState,
  Field,
  Icon,
  Input,
  LoadingState,
  Modal,
  PageHeader,
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
import { useActiveCashSession } from '@/providers/CashSessionProvider';
import { useReturnSale, useSale, useVoidSale } from '@/hooks/useSales';
import { extractMessage } from '@/lib/api';
import { currency, formatDateTime, humanize, num } from '@/lib/utils';
import type { Sale, SaleStatus } from '@/types';

const STATUS_TONE: Record<SaleStatus, 'success' | 'error'> = {
  COMPLETED: 'success',
  VOIDED: 'error',
};

export default function SaleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isAdmin } = useAuth();
  const { data: sale, isLoading, isError, error, refetch } = useSale(id);
  const [returnOpen, setReturnOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);

  const isCompleted = sale?.status === 'COMPLETED';
  const returnable =
    sale?.items?.some((it) => it.quantity - it.returnedQuantity > 0) ?? false;

  return (
    <div className="flex flex-col gap-gutter">
      <div>
        <Breadcrumbs
          className="mb-3"
          items={[
            { label: 'Home', to: '/' },
            { label: 'Sales', to: '/sales' },
            { label: sale?.invoiceNumber ?? 'Sale' },
          ]}
        />
        <PageHeader
          title={sale?.invoiceNumber ?? 'Sale'}
          description={
            sale ? `${formatDateTime(sale.createdAt)} · ${sale.user?.fullName ?? ''}` : undefined
          }
          actions={
            sale && isCompleted ? (
              <>
                {isAdmin && (
                  <Button variant="danger" icon="block" onClick={() => setVoidOpen(true)}>
                    Void Sale
                  </Button>
                )}
                <Button variant="outline" icon="undo" disabled={!returnable} onClick={() => setReturnOpen(true)}>
                  Process Return
                </Button>
                <Button variant="subtle" icon="print" onClick={() => window.print()}>
                  Print
                </Button>
              </>
            ) : undefined
          }
        />
      </div>

      {isLoading ? (
        <LoadingState label="Loading sale…" />
      ) : isError || !sale ? (
        <ErrorState message={extractMessage(error)} onRetry={refetch} />
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

          <ReturnModal sale={sale} open={returnOpen} onClose={() => setReturnOpen(false)} />
          <VoidModal sale={sale} open={voidOpen} onClose={() => setVoidOpen(false)} />
        </div>
      )}
    </div>
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

function ReturnModal({ sale, open, onClose }: { sale: Sale; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const ret = useReturnSale();
  const { session } = useActiveCashSession();
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
    if (!session) return toast.error('No open cash session', 'Open a cash session before processing a refund.');
    try {
      const result = await ret.mutateAsync({ id: sale.id, cashSessionId: session.id, items, reason: reason.trim() });
      const credit = Number(result.creditApplied);
      const cash = Number(result.totalRefund) - credit;
      const detail =
        credit > 0
          ? `${currency(credit)} applied to balance${cash > 0 ? `, ${currency(cash)} cash refunded` : ''}. Stock restored.`
          : 'Refund recorded and stock restored.';
      toast.success('Return processed', detail);
      onClose();
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
          <Button icon="undo" onClick={submit} loading={ret.isPending} disabled={!session}>
            Process Return
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!session && (
          <div className="rounded-xl border border-error/40 bg-error-container/40 px-4 py-3 text-body-sm font-semibold text-on-error-container">
            No open cash session — open one to refund from the till.
          </div>
        )}
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

function VoidModal({ sale, open, onClose }: { sale: Sale; open: boolean; onClose: () => void }) {
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
