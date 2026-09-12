import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Badge,
  Breadcrumbs,
  Button,
  Card,
  CardHeader,
  ErrorState,
  LoadingState,
  PageHeader,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from '@/components/ui';
import { useOfficePurchase } from '@/hooks/useExpenses';
import { useClientSort } from '@/hooks/useSort';
import { extractMessage } from '@/lib/api';
import { currency, formatDate, formatDateTime, num } from '@/lib/utils';
import { PayOfficePurchaseModal } from './OfficePurchasesPage';

export default function OfficePurchaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, error, refetch } = useOfficePurchase(id);
  const [payOpen, setPayOpen] = useState(false);
  const items = data?.items ?? [];
  const payments = data?.payments ?? [];
  const due = data ? num(data.amountDue) : 0;
  // Lines open in the order they were entered; the headers can regroup them.
  const lines = useClientSort(items, { by: 'none', dir: 'asc' }, {
    name: (i) => i.name,
    quantity: (i) => i.quantity,
    unitCost: (i) => num(i.unitCost),
    lineTotal: (i) => num(i.lineTotal),
  });

  return (
    <div className="flex flex-col gap-gutter">
      <div>
        <Breadcrumbs
          className="mb-3"
          items={[
            { label: 'Home', to: '/' },
            { label: 'Office Purchases', to: '/office-purchases' },
            { label: data ? formatDate(data.expenseDate) : 'Office Purchase' },
          ]}
        />
        <PageHeader
          title="Office Purchase"
          description={data ? formatDate(data.expenseDate) : undefined}
          actions={
            due > 0 ? (
              <Button icon="payments" onClick={() => setPayOpen(true)}>
                Pay {currency(due)}
              </Button>
            ) : undefined
          }
        />
      </div>

      {isLoading ? (
        <LoadingState label="Loading office purchase…" />
      ) : isError || !data ? (
        <ErrorState message={extractMessage(error)} onRetry={refetch} />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <Meta label="Supplier" value={data.supplierName || '—'} />
            <Meta label="Recorded by" value={data.user?.fullName ?? '—'} />
            <Meta label="Total" value={currency(data.amount)} />
            <Meta
              label="Paid"
              value={
                num(data.amountPaid) > 0 && data.paidFrom === 'HELD_CASH'
                  ? `${currency(data.amountPaid)} · held cash`
                  : currency(data.amountPaid)
              }
            />
            <div>
              <p className="text-[11px] uppercase tracking-wide text-on-surface-variant">
                Still owed
              </p>
              <p className="mt-0.5 flex items-center gap-2 font-medium text-on-surface">
                {due > 0 ? (
                  <>
                    <span className="font-mono-data text-error">{currency(due)}</span>
                    <Badge tone={num(data.amountPaid) > 0 ? 'warning' : 'error'}>
                      {num(data.amountPaid) > 0 ? 'Part-paid' : 'Unpaid'}
                    </Badge>
                  </>
                ) : (
                  <Badge tone="success">Paid in full</Badge>
                )}
              </p>
            </div>
          </div>
          <Card className="overflow-hidden">
            <Table>
              <THead sort={lines.sort} onSort={lines.onSort}>
                <TH sortKey="name">Item</TH>
                <TH align="center" sortKey="quantity" sortDefault="desc">Qty</TH>
                <TH align="right" sortKey="unitCost" sortDefault="desc">Unit Cost</TH>
                <TH align="right" sortKey="lineTotal" sortDefault="desc">Line Total</TH>
              </THead>
              <TBody>
                {lines.rows.map((i) => (
                  <TR key={i.id}>
                    <TD>{i.name}</TD>
                    <TD align="center" className="font-mono-data">{i.quantity}</TD>
                    <TD align="right" className="font-mono-data">{currency(i.unitCost)}</TD>
                    <TD align="right" className="font-mono-data font-semibold">{currency(i.lineTotal)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          {/* Only worth a section once there is something in it: a cash purchase
              records no payments, its money having left the till at once. */}
          {payments.length > 0 && (
            <Card className="overflow-hidden">
              <CardHeader
                title="Payments"
                subtitle="Each came out of the pot it names, on the day it was handed over"
              />
              <Table>
                <THead>
                  <TH>When</TH>
                  <TH>From</TH>
                  <TH>Recorded by</TH>
                  <TH>Notes</TH>
                  <TH align="right">Amount</TH>
                </THead>
                <TBody>
                  {payments.map((p) => (
                    <TR key={p.id}>
                      <TD>{formatDateTime(p.createdAt)}</TD>
                      <TD>
                        <Badge tone={p.paidFrom === 'HELD_CASH' ? 'info' : 'neutral'}>
                          {p.paidFrom === 'HELD_CASH' ? 'Held cash' : 'Till'}
                        </Badge>
                      </TD>
                      <TD className="text-on-surface-variant">{p.user?.fullName ?? '—'}</TD>
                      <TD className="text-on-surface-variant">{p.notes || '—'}</TD>
                      <TD align="right" className="font-mono-data font-semibold">
                        {currency(p.amount)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          )}
          {data.description && (
            <p className="text-body-sm text-on-surface-variant">{data.description}</p>
          )}
        </div>
      )}

      <PayOfficePurchaseModal
        expense={payOpen && data ? data : null}
        onClose={() => setPayOpen(false)}
      />
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-on-surface-variant">{label}</p>
      <p className="mt-0.5 font-medium text-on-surface">{value}</p>
    </div>
  );
}
