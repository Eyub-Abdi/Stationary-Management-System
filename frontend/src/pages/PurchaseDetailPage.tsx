import { useParams } from 'react-router-dom';
import {
  Breadcrumbs,
  Card,
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
import { usePurchase } from '@/hooks/usePurchases';
import { extractMessage } from '@/lib/api';
import { currency, formatDate, num } from '@/lib/utils';

export default function PurchaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, error, refetch } = usePurchase(id);

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
        />
      </div>

      {isLoading ? (
        <LoadingState label="Loading purchase…" />
      ) : isError || !data ? (
        <ErrorState message={extractMessage(error)} onRetry={refetch} />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Meta label="Supplier" value={data.supplier?.name ?? 'Direct / Walk-in'} />
            <Meta label="Date" value={formatDate(data.purchaseDate)} />
            <Meta label="Recorded by" value={data.user?.fullName ?? '—'} />
            <Meta label="Payment" value={data.paymentMethod === 'CREDIT' ? 'Credit' : 'Cash'} />
          </div>
          <Card className="overflow-hidden">
            <Table>
              <THead>
                <TH>Product</TH>
                <TH align="center">Qty</TH>
                <TH align="right">Unit Cost</TH>
                <TH align="right">Line Total</TH>
              </THead>
              <TBody>
                {data.items?.map((it) => (
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
        </div>
      )}
    </div>
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
