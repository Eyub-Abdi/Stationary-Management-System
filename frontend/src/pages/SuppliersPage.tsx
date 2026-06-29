import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Checkbox,
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
  Textarea,
} from '@/components/ui';
import { useToast } from '@/providers/ToastProvider';
import {
  useCreateSupplier,
  useRecordSupplierPayment,
  useSupplier,
  useSuppliers,
  useSupplierSummary,
  useUpdateSupplier,
  type SupplierInput,
} from '@/hooks/useCatalog';
import { extractMessage } from '@/lib/api';
import { currency, formatDate, num } from '@/lib/utils';
import type { Supplier } from '@/types';

export default function SuppliersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'owing'>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch, error } = useSuppliers({
    page,
    limit: 12,
    search: search || undefined,
    withBalance: filter === 'owing' || undefined,
  });
  const summary = useSupplierSummary();
  const stats = summary.data;

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  return (
    <div className="flex flex-col gap-gutter">
      <PageHeader
        title="Suppliers"
        description="Creditors you buy stock from. Track what you owe and record payments."
        actions={
          <Button icon="add" onClick={openCreate}>
            New Supplier
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-gutter lg:grid-cols-4">
        <StatCard
          label="Total we owe"
          icon="account_balance_wallet"
          accent="error"
          value={currency(stats?.totalPayable ?? 0)}
          hint="Outstanding payables"
          loading={summary.isLoading}
        />
        <StatCard
          label="Suppliers we owe"
          icon="groups"
          accent="tertiary"
          value={num(stats?.weOweCount ?? 0).toString()}
          hint={`of ${num(stats?.supplierCount ?? 0)} total`}
          loading={summary.isLoading}
        />
        <StatCard
          label="Largest single debt"
          icon="trending_up"
          accent="error"
          value={currency(stats?.largestDebt ?? 0)}
          hint="Biggest creditor balance"
          loading={summary.isLoading}
        />
        <StatCard
          label="Total suppliers"
          icon="local_shipping"
          accent="primary"
          value={num(stats?.supplierCount ?? 0).toString()}
          hint="On record"
          loading={summary.isLoading}
        />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-outline-variant p-4 sm:flex-row sm:items-center sm:justify-between">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search by name…"
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
              { value: 'owing', label: 'We owe' },
            ]}
          />
        </div>

        {isLoading ? (
          <LoadingState label="Loading suppliers…" />
        ) : isError ? (
          <ErrorState message={extractMessage(error)} onRetry={refetch} />
        ) : data!.data.length === 0 ? (
          <EmptyState
            icon="local_shipping"
            title="No suppliers"
            description="Add a supplier to record purchases and credit."
            action={<Button icon="add" onClick={openCreate}>New Supplier</Button>}
          />
        ) : (
          <>
            <Table>
              <THead>
                <TH>Name</TH>
                <TH>Phone</TH>
                <TH align="right">We owe</TH>
                <TH align="right">Action</TH>
              </THead>
              <TBody>
                {data!.data.map((s) => (
                  <TR key={s.id} onClick={() => setDetailsId(s.id)}>
                    <TD className="font-semibold text-on-surface">
                      {s.name}
                      {!s.isActive && <Badge tone="neutral" className="ml-2">Inactive</Badge>}
                    </TD>
                    <TD className="text-on-surface-variant">{s.phone ?? '—'}</TD>
                    <TD align="right" className="font-mono-data">
                      {num(s.balance) > 0 ? (
                        <span className="font-semibold text-error">{currency(s.balance)}</span>
                      ) : (
                        <span className="text-on-surface-variant">—</span>
                      )}
                    </TD>
                    <TD align="right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing(s);
                          setFormOpen(true);
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

      <SupplierFormModal open={formOpen} onClose={() => setFormOpen(false)} supplier={editing} />
      <SupplierDetailsModal id={detailsId} onClose={() => setDetailsId(null)} />
    </div>
  );
}

function SupplierFormModal({
  open,
  onClose,
  supplier,
}: {
  open: boolean;
  onClose: () => void;
  supplier: Supplier | null;
}) {
  const toast = useToast();
  const create = useCreateSupplier();
  const update = useUpdateSupplier();
  const isEdit = !!supplier;
  const saving = create.isPending || update.isPending;

  const [form, setForm] = useState<SupplierInput>({ name: '' });

  useEffect(() => {
    if (!open) return;
    setForm(
      supplier
        ? {
            name: supplier.name,
            phone: supplier.phone ?? '',
            email: supplier.email ?? '',
            address: supplier.address ?? '',
            isActive: supplier.isActive,
          }
        : { name: '', phone: '', email: '', address: '' },
    );
  }, [open, supplier]);

  const set = (k: keyof SupplierInput, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error('Name required', 'Enter the supplier name.');
      return;
    }
    const payload: SupplierInput = {
      name: form.name.trim(),
      phone: form.phone?.trim() || undefined,
      email: form.email?.trim() || undefined,
      address: form.address?.trim() || undefined,
      ...(isEdit ? { isActive: form.isActive } : {}),
    };
    try {
      if (isEdit) {
        await update.mutateAsync({ id: supplier!.id, input: payload });
        toast.success('Supplier updated', `${payload.name} saved.`);
      } else {
        await create.mutateAsync(payload);
        toast.success('Supplier created', `${payload.name} added.`);
      }
      onClose();
    } catch (e) {
      toast.error('Save failed', extractMessage(e));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={isEdit ? 'Edit Supplier' : 'New Supplier'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving} icon="check">
            {isEdit ? 'Save changes' : 'Create supplier'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" required>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Dar Paper Distributors" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Phone">
            <Input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} placeholder="07xx xxx xxx" />
          </Field>
          <Field label="Email">
            <Input value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} placeholder="optional" />
          </Field>
        </div>
        <Field label="Address">
          <Textarea value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} placeholder="Optional…" />
        </Field>
        {isEdit && (
          <Checkbox
            id="sup-active"
            label="Active"
            checked={form.isActive ?? true}
            onChange={(e) => set('isActive', e.target.checked)}
          />
        )}
      </div>
    </Modal>
  );
}

function SupplierDetailsModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const toast = useToast();
  const { data, isLoading } = useSupplier(id ?? undefined);
  const recordPayment = useRecordSupplierPayment();
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

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
    <Modal open={!!id} onClose={onClose} size="lg" title={data?.name ?? 'Supplier'} subtitle={data?.phone ?? undefined}>
      {isLoading || !data ? (
        <LoadingState />
      ) : (
        <div className="space-y-5">
          <div className="flex items-center justify-between rounded-xl bg-surface-container-low px-4 py-3">
            <span className="text-body-sm font-semibold text-on-surface-variant">Balance we owe</span>
            <span className={`font-mono-data text-h3 font-bold ${balance > 0 ? 'text-error' : 'text-secondary'}`}>
              {currency(data.balance)}
            </span>
          </div>

          {balance > 0 && (
            <div className="rounded-xl border border-outline-variant p-4">
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
            </div>
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
    </Modal>
  );
}
