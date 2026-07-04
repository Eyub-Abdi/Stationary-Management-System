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
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from '@/components/ui';
import { DocLink } from '@/components/DocLink';
import { CustomerFormModal } from '@/features/customers/CustomerFormModal';
import { useToast } from '@/providers/ToastProvider';
import { useCustomer, useRecordCustomerPayment } from '@/hooks/useCustomers';
import { extractMessage } from '@/lib/api';
import { currency, formatDate, num } from '@/lib/utils';

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { data, isLoading, isError, error, refetch } = useCustomer(id);
  const recordPayment = useRecordCustomerPayment();
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);

  useEffect(() => {
    setAmount('');
    setNotes('');
    setSelectedSaleId(null);
  }, [id]);

  const sales = data?.sales ?? [];
  // Default the selection to the most recent credit sale until the user picks one.
  const selectedSale = sales.find((s) => s.id === selectedSaleId) ?? sales[0] ?? null;

  const balance = data ? num(data.balance) : 0;
  const limit = data?.creditLimit ? num(data.creditLimit) : null;
  const available = limit != null ? limit - balance : null;

  // Per-invoice aging computed from this customer's unpaid credit sales.
  const aging = (data?.sales ?? [])
    .filter((s) => s.status === 'COMPLETED' && num(s.amountDue) > 0)
    .reduce(
      (acc, s) => {
        const days = (Date.now() - new Date(s.createdAt).getTime()) / 86_400_000;
        const due = num(s.amountDue);
        if (days <= 30) acc.current += due;
        else if (days <= 60) acc.d3160 += due;
        else if (days <= 90) acc.d6190 += due;
        else acc.d90 += due;
        return acc;
      },
      { current: 0, d3160: 0, d6190: 0, d90: 0 },
    );

  const pay = async () => {
    const value = num(amount);
    if (value <= 0) {
      toast.error('Enter an amount', 'The repayment must be greater than zero.');
      return;
    }
    if (value > balance) {
      toast.error('Too much', 'Payment exceeds the outstanding balance.');
      return;
    }
    try {
      await recordPayment.mutateAsync({ id: data!.id, amount: value, notes: notes.trim() || undefined });
      toast.success('Payment recorded', `${currency(value)} received from ${data!.name}.`);
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
            { label: 'Customers', to: '/customers' },
            { label: data?.name ?? 'Customer' },
          ]}
        />
        <PageHeader
          title={data?.name ?? 'Customer'}
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
        <LoadingState label="Loading customer…" />
      ) : isError || !data ? (
        <ErrorState message={extractMessage(error)} onRetry={refetch} />
      ) : (
        <div className="flex flex-col gap-gutter">
          {!data.isActive && (
            <Badge tone="neutral" className="w-fit">Inactive customer</Badge>
          )}

          <Card className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <InfoItem icon="call" label="Phone" value={data.phone} />
            <InfoItem icon="mail" label="Email" value={data.email} />
            <InfoItem icon="location_on" label="Address" value={data.address} />
            <InfoItem
              icon="credit_score"
              label="Credit limit"
              value={data.creditLimit ? currency(data.creditLimit) : null}
            />
            <InfoItem icon="event" label="Customer since" value={formatDate(data.createdAt)} />
          </Card>

          <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <span className="text-body-sm font-semibold text-on-surface-variant">Outstanding balance</span>
              {limit != null && (
                <p className="text-[12px] text-on-surface-variant">
                  Limit {currency(limit)} ·{' '}
                  <span className={available != null && available < 0 ? 'text-error' : 'text-secondary'}>
                    {currency(Math.max(0, available ?? 0))} available
                  </span>
                </p>
              )}
            </div>
            <span className={`font-mono-data text-h2 font-bold ${balance > 0 ? 'text-error' : 'text-secondary'}`}>
              {currency(data.balance)}
            </span>
          </Card>

          {balance > 0 && (
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-outline-variant bg-outline-variant sm:grid-cols-4">
              <AgingCell label="0–30d" value={aging.current} />
              <AgingCell label="31–60d" value={aging.d3160} />
              <AgingCell label="61–90d" value={aging.d6190} />
              <AgingCell label="90+ d" value={aging.d90} danger />
            </div>
          )}

          {balance > 0 && (
            <Card className="p-4">
              <p className="text-label-caps uppercase tracking-wide text-on-surface-variant">Record a repayment</p>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <Field label="Amount" className="w-40">
                  <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
                </Field>
                <Field label="Notes" className="min-w-[160px] flex-1">
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
                </Field>
                <Button icon="payments" onClick={pay} loading={recordPayment.isPending}>
                  Receive
                </Button>
              </div>
            </Card>
          )}

          <div>
            <p className="mb-2 text-label-caps uppercase tracking-wide text-on-surface-variant">
              Credit sales
              {sales.length > 0 && (
                <span className="ml-2 font-normal normal-case tracking-normal text-outline">
                  — select an invoice to see its repayments
                </span>
              )}
            </p>
            {sales.length > 0 ? (
              <Card className="overflow-hidden">
                <Table>
                  <THead>
                    <TH>Invoice</TH>
                    <TH>Date</TH>
                    <TH>Sold by</TH>
                    <TH align="right">Total</TH>
                    <TH align="right">Owing</TH>
                  </THead>
                  <TBody>
                    {sales.map((s) => {
                      const active = selectedSale?.id === s.id;
                      return (
                        <TR
                          key={s.id}
                          onClick={() => setSelectedSaleId(s.id)}
                          className={active ? 'bg-primary-container/40 hover:bg-primary-container/40' : undefined}
                        >
                          <TD className={active ? 'border-l-2 border-primary' : 'border-l-2 border-transparent'}>
                            <DocLink kind="sale" id={s.id}>{s.invoiceNumber}</DocLink>
                          </TD>
                          <TD>{formatDate(s.createdAt)}</TD>
                          <TD className="whitespace-nowrap text-on-surface-variant">{s.user?.fullName ?? '—'}</TD>
                          <TD align="right" className="font-mono-data">{currency(s.total)}</TD>
                          <TD align="right" className="font-mono-data font-semibold text-error">
                            {currency(s.amountDue)}
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              </Card>
            ) : (
              <p className="text-body-sm text-on-surface-variant">No credit sales yet.</p>
            )}
          </div>

          {selectedSale && (
            <div>
              <p className="mb-2 text-label-caps uppercase tracking-wide text-on-surface-variant">
                Repayments for{' '}
                <span className="font-mono-data normal-case tracking-normal text-primary">
                  {selectedSale.invoiceNumber}
                </span>
              </p>
              {selectedSale.paymentAllocations && selectedSale.paymentAllocations.length > 0 ? (
                <ul className="space-y-2">
                  {selectedSale.paymentAllocations.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between rounded-lg border border-outline-variant px-3 py-2 text-body-sm"
                    >
                      <div>
                        <span className="font-mono-data font-semibold text-secondary">{currency(a.amount)}</span>
                        {a.payment?.user?.fullName && (
                          <span className="ml-2 text-on-surface-variant">· received by {a.payment.user.fullName}</span>
                        )}
                        {a.payment?.notes && <span className="ml-2 text-on-surface-variant">· {a.payment.notes}</span>}
                      </div>
                      <span className="text-[12px] text-on-surface-variant">{formatDate(a.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-body-sm text-on-surface-variant">
                  No repayments applied to this invoice yet.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <CustomerFormModal open={editOpen} onClose={() => setEditOpen(false)} customer={data ?? null} />
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

function AgingCell({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="bg-surface-container-lowest px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-on-surface-variant">{label}</p>
      <p className={`font-mono-data text-body-sm font-bold ${danger && value > 0 ? 'text-error' : 'text-on-surface'}`}>
        {currency(value)}
      </p>
    </div>
  );
}

/** Path builder so other pages can deep-link into a customer's detail. */
export function customerPath(id: string): string {
  return `/customers/${id}`;
}
