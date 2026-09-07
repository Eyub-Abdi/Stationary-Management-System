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
import { useClientSort } from '@/hooks/useSort';
import { usePurchase, useVoidPurchase } from '@/hooks/usePurchases';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { extractMessage } from '@/lib/api';
import { currency, formatDate, num } from '@/lib/utils';
import type { Purchase } from '@/types';

export default function PurchaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const { data, isLoading, isError, error, refetch } = usePurchase(id);
  const [undoOpen, setUndoOpen] = useState(false);
  // Lines open in the order they were entered; the headers can regroup them.
  const lines = useClientSort(data?.items, { by: 'none', dir: 'asc' }, {
    productNameSnapshot: (it) => it.productNameSnapshot,
    quantity: (it) => it.quantity,
    unitCost: (it) => num(it.unitCost),
    lineTotal: (it) => num(it.lineTotal),
  });

  return (
    <div className="flex flex-col gap-gutter">
      <div>
        <Breadcrumbs
          className="mb-3"
          items={[
            { label: 'Home', to: '/' },
            { label: 'Purchases', to: '/purchases' },
            { label: data?.purchaseNumber ?? 'Purchase' },
          ]}
        />
        <PageHeader
          title={data?.purchaseNumber ?? 'Purchase'}
          description={data ? formatDate(data.purchaseDate) : undefined}
          actions={
            data && data.status === 'COMPLETED' && can('purchases') ? (
              <Button variant="danger" icon="undo" onClick={() => setUndoOpen(true)}>
                Undo Purchase
              </Button>
            ) : data && data.status === 'VOIDED' ? (
              <Badge tone="error">Undone</Badge>
            ) : undefined
          }
        />
      </div>

      {isLoading ? (
        <LoadingState label="Loading purchase…" />
      ) : isError || !data ? (
        <ErrorState message={extractMessage(error)} onRetry={refetch} />
      ) : (
        <div className="space-y-4">
          {/* An undone purchase keeps its number and its lines, so the page has
              to say plainly that none of it counts any more. */}
          {data.status === 'VOIDED' && (
            <div className="flex items-start gap-2 rounded-xl bg-error-container/40 px-4 py-3 text-on-error-container">
              <Icon name="undo" size={20} className="shrink-0 text-error" />
              <div className="text-body-sm">
                <p className="font-semibold">This purchase was undone.</p>
                <p className="mt-0.5">
                  The stock went back off the shelf and the cost no longer counts.
                  {data.voidReason ? ` Reason: ${data.voidReason}` : ''}
                </p>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Meta label="Supplier" value={data.supplier?.name ?? 'Direct / Walk-in'} />
            <Meta label="Date" value={formatDate(data.purchaseDate)} />
            <Meta label="Recorded by" value={data.user?.fullName ?? '—'} />
            <Meta label="Payment" value={data.paymentMethod === 'CREDIT' ? 'Credit' : 'Cash'} />
          </div>
          <Card className="overflow-hidden">
            <Table>
              <THead sort={lines.sort} onSort={lines.onSort}>
                <TH sortKey="productNameSnapshot">Product</TH>
                <TH align="center" sortKey="quantity" sortDefault="desc">Qty</TH>
                <TH align="right" sortKey="unitCost" sortDefault="desc">Unit Cost</TH>
                <TH align="right" sortKey="lineTotal" sortDefault="desc">Line Total</TH>
              </THead>
              <TBody>
                {lines.rows.map((it) => (
                  <TR key={it.id}>
                    <TD className="font-medium">{it.productNameSnapshot}</TD>
                    <TD align="center" className="font-mono-data">
                      {it.quantity} {it.unitLabel}
                      {it.unitSize > 1 ? ` (×${it.unitSize})` : ''}
                    </TD>
                    <TD align="right" className="font-mono-data">{currency(it.unitCost)}</TD>
                    <TD align="right" className="font-mono-data font-semibold">{currency(it.lineTotal)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <div className="ml-auto w-full max-w-xs space-y-2 rounded-xl bg-surface-container-low px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-body-sm font-semibold text-on-surface-variant">Total Cost</span>
              <span className="font-mono-data text-h3 font-bold text-primary">{currency(data.totalCost)}</span>
            </div>
            <div className="flex items-center justify-between text-body-sm">
              <span className="text-on-surface-variant">Paid</span>
              <span className="font-mono-data font-semibold">{currency(data.amountPaid)}</span>
            </div>
            {num(data.amountDue) > 0 && (
              <div className="flex items-center justify-between text-body-sm">
                <span className="text-on-surface-variant">Owing</span>
                <span className="font-mono-data font-semibold text-error">{currency(data.amountDue)}</span>
              </div>
            )}
          </div>
          {data.notes && <p className="text-body-sm text-on-surface-variant">{data.notes}</p>}
          <UndoModal purchase={data} open={undoOpen} onClose={() => setUndoOpen(false)} />
        </div>
      )}
    </div>
  );
}

/**
 * Undoing is offered rather than editing, because a purchase that has already
 * put costed stock on the shelf cannot be edited in place without rewriting the
 * COGS of anything sold from it. The API refuses on exactly that ground, so the
 * message it sends back is worth showing verbatim.
 */
function UndoModal({
  purchase,
  open,
  onClose,
}: {
  purchase: Purchase;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const undo = useVoidPurchase();
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  const submit = async () => {
    if (reason.trim().length < 5) return toast.error('Enter a reason (min 5 characters)');
    try {
      await undo.mutateAsync({ id: purchase.id, reason: reason.trim() });
      toast.success('Purchase undone', 'Stock, supplier balance and till cash are back as they were.');
      onClose();
    } catch (e) {
      toast.error('Could not undo this purchase', extractMessage(e));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Undo Purchase"
      subtitle={purchase.purchaseNumber}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={undo.isPending}>
            Cancel
          </Button>
          <Button variant="danger" icon="undo" onClick={submit} loading={undo.isPending}>
            Undo Purchase
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-xl border border-error/30 bg-error-container/40 px-4 py-3 text-on-error-container">
          <Icon name="warning" size={20} className="shrink-0 text-error" />
          <p className="text-body-sm">
            This takes {currency(purchase.totalCost)} of stock back off the shelf and returns
            the cash to the till. It only works while nothing has been sold out of this
            purchase. It cannot itself be undone.
          </p>
        </div>
        <Field label="Reason" required>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this purchase being undone?"
          />
        </Field>
      </div>
    </Modal>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-label-caps uppercase tracking-wide text-on-surface-variant">{label}</p>
      <p className="mt-0.5 text-body-sm font-semibold text-on-surface">{value}</p>
    </div>
  );
}
