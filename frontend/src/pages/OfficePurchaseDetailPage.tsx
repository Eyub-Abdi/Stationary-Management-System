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
import { useOfficePurchase } from '@/hooks/useExpenses';
import { extractMessage } from '@/lib/api';
import { currency, formatDate } from '@/lib/utils';

export default function OfficePurchaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, error, refetch } = useOfficePurchase(id);
  const items = data?.items ?? [];

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
        />
      </div>

      {isLoading ? (
        <LoadingState label="Loading office purchase…" />
      ) : isError || !data ? (
        <ErrorState message={extractMessage(error)} onRetry={refetch} />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Meta label="Supplier" value={data.supplierName || '—'} />
            <Meta label="Recorded by" value={data.user?.fullName ?? '—'} />
            <Meta label="Total" value={currency(data.amount)} />
          </div>
          <Card className="overflow-hidden">
            <Table>
              <THead>
                <TH>Item</TH>
                <TH align="center">Qty</TH>
                <TH align="right">Unit Cost</TH>
                <TH align="right">Line Total</TH>
              </THead>
              <TBody>
                {items.map((i) => (
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
          {data.description && (
            <p className="text-body-sm text-on-surface-variant">{data.description}</p>
          )}
        </div>
      )}
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
