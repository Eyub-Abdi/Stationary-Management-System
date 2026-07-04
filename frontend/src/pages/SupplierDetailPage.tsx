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
  PageHeader,
} from '@/components/ui';
import { SupplierFormModal } from '@/features/suppliers/SupplierFormModal';
import { useToast } from '@/providers/ToastProvider';
import { useRecordSupplierPayment, useSupplier } from '@/hooks/useCatalog';
import { extractMessage } from '@/lib/api';
import { currency, formatDate, num } from '@/lib/utils';

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { data, isLoading, isError, error, refetch } = useSupplier(id);
  const recordPayment = useRecordSupplierPayment();
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    setAmount('');
    setNotes('');
  }, [id]);

  const balance = data ? num(data.balance) : 0;

  const pay = async () => {
    const value = num(amount);
    if (value <= 0) {
      toast.error('Enter an amount', 'The payment must be greater than zero.');
      return;
    }
    if (value > balance) {
      toast.error('Too much', 'Payment exceeds what we owe.');
      return;
    }
    try {
      await recordPayment.mutateAsync({ id: data!.id, amount: value, notes: notes.trim() || undefined });
      toast.success('Payment recorded', `${currency(value)} paid to ${data!.name}.`);
      setAmount('');
      setNotes('');
    } catch (e) {
      toast.error('Payment failed', extractMessage(e));
    }
  };

  return (
    <div className="flex flex-col gap-gutter">
      <div>
        <Breadcrumbs
          className="mb-3"
          items={[
            { label: 'Home', to: '/' },
            { label: 'Suppliers', to: '/suppliers' },
            { label: data?.name ?? 'Supplier' },
          ]}
        />
        <PageHeader
          title={data?.name ?? 'Supplier'}
          description={data?.phone ?? undefined}
          actions={
            data && (
              <Button variant="outline" icon="edit" onClick={() => setEditOpen(true)}>
                Edit
              </Button>
            )
          }
        />
      </div>

      {isLoading ? (
        <LoadingState label="Loading supplier…" />
      ) : isError || !data ? (
        <ErrorState message={extractMessage(error)} onRetry={refetch} />
      ) : (
        <div className="flex flex-col gap-gutter">
          {!data.isActive && <Badge tone="neutral" className="w-fit">Inactive supplier</Badge>}

          <Card className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <InfoItem icon="call" label="Phone" value={data.phone} />
            <InfoItem icon="mail" label="Email" value={data.email} />
            <InfoItem icon="location_on" label="Address" value={data.address} />
            <InfoItem icon="event" label="Supplier since" value={formatDate(data.createdAt)} />
          </Card>

          <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
            <span className="text-body-sm font-semibold text-on-surface-variant">Balance we owe</span>
            <span className={`font-mono-data text-h2 font-bold ${balance > 0 ? 'text-error' : 'text-secondary'}`}>
              {currency(data.balance)}
            </span>
          </Card>

          {balance > 0 && (
            <Card className="p-4">
              <p className="text-label-caps uppercase tracking-wide text-on-surface-variant">Record a payment</p>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <Field label="Amount" className="w-40">
                  <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
                </Field>
                <Field label="Notes" className="min-w-[160px] flex-1">
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
                </Field>
                <Button icon="payments" onClick={pay} loading={recordPayment.isPending}>
                  Pay
                </Button>
              </div>
            </Card>
          )}

          <div>
            <p className="mb-2 text-label-caps uppercase tracking-wide text-on-surface-variant">Payment history</p>
            {data.payments && data.payments.length > 0 ? (
              <ul className="space-y-2">
                {data.payments.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between rounded-lg border border-outline-variant px-3 py-2 text-body-sm"
                  >
                    <div>
                      <span className="font-mono-data font-semibold text-secondary">{currency(p.amount)}</span>
                      {p.user?.fullName && (
                        <span className="ml-2 text-on-surface-variant">· paid by {p.user.fullName}</span>
                      )}
                      {p.notes && <span className="ml-2 text-on-surface-variant">· {p.notes}</span>}
                    </div>
                    <span className="text-[12px] text-on-surface-variant">{formatDate(p.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body-sm text-on-surface-variant">No payments recorded.</p>
            )}
          </div>
        </div>
      )}

      <SupplierFormModal open={editOpen} onClose={() => setEditOpen(false)} supplier={data ?? null} />
    </div>
  );
}

/** A labelled contact/detail field — hidden entirely when the value is unset. */
function InfoItem({ icon, label, value }: { icon: string; label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-container text-on-surface-variant">
        <Icon name={icon} size={18} />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-on-surface-variant">{label}</p>
        <p className="break-words text-body-sm font-medium text-on-surface">{value}</p>
      </div>
    </div>
  );
}
