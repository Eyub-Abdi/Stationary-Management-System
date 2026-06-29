import { useEffect, useState } from 'react';
import {
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
  SegmentedControl,
  StatCard,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from '@/components/ui';
import { CustomerFormModal } from '@/features/customers/CustomerFormModal';
import { useToast } from '@/providers/ToastProvider';
import {
  useCustomer,
  useCustomerAging,
  useCustomers,
  useRecordCustomerPayment,
} from '@/hooks/useCustomers';
import { extractMessage } from '@/lib/api';
import { currency, formatDate, num } from '@/lib/utils';
import type { Customer } from '@/types';

export default function CustomersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'owing'>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch, error } = useCustomers({
    page,
    limit: 12,
    search: search || undefined,
    withBalance: filter === 'owing' || undefined,
  });

  const aging = useCustomerAging();
  // Aging totals + per-customer overdue (90+) lookup for the list badges.
  const agingTotals = (aging.data ?? []).reduce(
    (a, r) => ({
      current: a.current + num(r.current),
      d3160: a.d3160 + num(r.days31to60),
      d6190: a.d6190 + num(r.days61to90),
      d90: a.d90 + num(r.days90plus),
    }),
    { current: 0, d3160: 0, d6190: 0, d90: 0 },
  );
  const overdue90 = new Set((aging.data ?? []).filter((r) => num(r.days90plus) > 0).map((r) => r.id));

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (c: Customer) => {
    setEditing(c);
    setFormOpen(true);
  };

  return (
    <div className="flex flex-col gap-gutter">
      <PageHeader
        title="Customers"
        description="Debtors who buy on credit. Track outstanding balances and record repayments."
        actions={
          <Button icon="person_add" onClick={openCreate}>
            New Customer
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-gutter sm:grid-cols-4">
        <StatCard label="Current (0–30d)" icon="schedule" accent="primary" value={currency(agingTotals.current)} loading={aging.isLoading} />
        <StatCard label="31–60 days" icon="hourglass_bottom" accent="tertiary" value={currency(agingTotals.d3160)} loading={aging.isLoading} />
        <StatCard label="61–90 days" icon="warning" accent="tertiary" value={currency(agingTotals.d6190)} loading={aging.isLoading} />
        <StatCard label="90+ days overdue" icon="error" accent="error" value={currency(agingTotals.d90)} loading={aging.isLoading} />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-outline-variant p-4 sm:flex-row sm:items-center sm:justify-between">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search by name or phone…"
            className="max-w-md"
          />
          <SegmentedControl
            value={filter}
            onChange={(v) => {
              setFilter(v);
              setPage(1);
            }}
            items={[
              { value: 'all', label: 'All' },
              { value: 'owing', label: 'Owing' },
            ]}
          />
        </div>

        {isLoading ? (
          <LoadingState label="Loading customers…" />
        ) : isError ? (
          <ErrorState message={extractMessage(error)} onRetry={refetch} />
        ) : data!.data.length === 0 ? (
          <EmptyState
            icon="group"
            title="No customers"
            description="Add a customer to start recording credit sales."
            action={<Button icon="person_add" onClick={openCreate}>New Customer</Button>}
          />
        ) : (
          <>
            <Table>
              <THead>
                <TH>Name</TH>
                <TH>Phone</TH>
                <TH align="right">Balance owed</TH>
                <TH align="right">Action</TH>
              </THead>
              <TBody>
                {data!.data.map((c) => (
                  <TR key={c.id} onClick={() => setDetailsId(c.id)}>
                    <TD className="font-semibold text-on-surface">
                      {c.name}
                      {!c.isActive && <Badge tone="neutral" className="ml-2">Inactive</Badge>}
                      {overdue90.has(c.id) && <Badge tone="error" className="ml-2">Overdue 90+</Badge>}
                      {c.creditLimit && num(c.balance) > num(c.creditLimit) && (
                        <Badge tone="warning" className="ml-2">Over limit</Badge>
                      )}
                    </TD>
                    <TD className="text-on-surface-variant">{c.phone ?? '—'}</TD>
                    <TD align="right" className="font-mono-data">
                      {num(c.balance) > 0 ? (
                        <span className="font-semibold text-error">{currency(c.balance)}</span>
                      ) : (
                        <span className="text-on-surface-variant">—</span>
                      )}
                      {c.creditLimit && (
                        <span className="block text-[11px] text-on-surface-variant">
                          limit {currency(c.creditLimit)}
                        </span>
                      )}
                    </TD>
                    <TD align="right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(c);
                        }}
                        className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                      >
                        <Icon name="edit" size={18} />
                      </button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination meta={data!.meta} onPage={setPage} />
          </>
        )}
      </Card>

      <CustomerFormModal open={formOpen} onClose={() => setFormOpen(false)} customer={editing} />
      <CustomerDetailsModal id={detailsId} onClose={() => setDetailsId(null)} />
    </div>
  );
}

function CustomerDetailsModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const toast = useToast();
  const { data, isLoading } = useCustomer(id ?? undefined);
  const recordPayment = useRecordCustomerPayment();
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setAmount('');
    setNotes('');
  }, [id]);

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
    <Modal open={!!id} onClose={onClose} size="lg" title={data?.name ?? 'Customer'} subtitle={data?.phone ?? undefined}>
      {isLoading || !data ? (
        <LoadingState />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-container-low px-4 py-3">
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
            <span className={`font-mono-data text-h3 font-bold ${balance > 0 ? 'text-error' : 'text-secondary'}`}>
              {currency(data.balance)}
            </span>
          </div>

          {balance > 0 && (
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-outline-variant bg-outline-variant sm:grid-cols-4">
              <AgingCell label="0–30d" value={aging.current} />
              <AgingCell label="31–60d" value={aging.d3160} />
              <AgingCell label="61–90d" value={aging.d6190} />
              <AgingCell label="90+ d" value={aging.d90} danger />
            </div>
          )}

          {balance > 0 && (
            <div className="rounded-xl border border-outline-variant p-4">
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
            </div>
          )}

          <div>
            <p className="mb-2 text-label-caps uppercase tracking-wide text-on-surface-variant">Credit sales</p>
            {data.sales && data.sales.length > 0 ? (
              <Card className="overflow-hidden">
                <Table>
                  <THead>
                    <TH>Invoice</TH>
                    <TH>Date</TH>
                    <TH align="right">Total</TH>
                    <TH align="right">Owing</TH>
                  </THead>
                  <TBody>
                    {data.sales.map((s) => (
                      <TR key={s.id}>
                        <TD className="font-mono-data text-primary">{s.invoiceNumber}</TD>
                        <TD>{formatDate(s.createdAt)}</TD>
                        <TD align="right" className="font-mono-data">{currency(s.total)}</TD>
                        <TD align="right" className="font-mono-data font-semibold text-error">
                          {currency(s.amountDue)}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </Card>
            ) : (
              <p className="text-body-sm text-on-surface-variant">No credit sales yet.</p>
            )}
          </div>

          <div>
            <p className="mb-2 text-label-caps uppercase tracking-wide text-on-surface-variant">Repayment history</p>
            {data.payments && data.payments.length > 0 ? (
              <ul className="space-y-2">
                {data.payments.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between rounded-lg border border-outline-variant px-3 py-2 text-body-sm"
                  >
                    <div>
                      <span className="font-mono-data font-semibold text-secondary">{currency(p.amount)}</span>
                      {p.notes && <span className="ml-2 text-on-surface-variant">· {p.notes}</span>}
                    </div>
                    <span className="text-[12px] text-on-surface-variant">{formatDate(p.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body-sm text-on-surface-variant">No repayments recorded.</p>
            )}
          </div>
        </div>
      )}
    </Modal>
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
