import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
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
  useCreateOfficePurchase,
  useOfficePurchases,
  type OfficePurchaseItemInput,
} from '@/hooks/useExpenses';
import { extractMessage } from '@/lib/api';
import { currency, endOfToday, formatDate, num, startOfMonth } from '@/lib/utils';
import type { Expense } from '@/types';

export default function OfficePurchasesPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, isError, refetch, error } = useOfficePurchases({ page, limit: 12 });

  const month = useOfficePurchases({ from: startOfMonth(), to: endOfToday(), limit: 100 });
  const monthRows = month.data?.data ?? [];
  const monthTotal = monthRows.reduce((a, e) => a + num(e.amount), 0);
  const monthItems = monthRows.reduce((a, e) => a + (e.items?.length ?? 0), 0);

  return (
    <div className="flex flex-col gap-gutter">
      <PageHeader
        title="Office Purchases"
        description="Record goods bought for internal/office use (not for resale). Booked as a cost — never added to sellable stock."
        actions={
          <Button icon="add" onClick={() => setCreateOpen(true)}>
            New Office Purchase
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-gutter sm:grid-cols-3">
        <StatCard
          label="This Month"
          icon="business_center"
          accent="error"
          loading={month.isLoading}
          value={currency(monthTotal)}
          hint={`${monthRows.length} purchase(s)`}
        />
        <StatCard
          label="Items Bought"
          icon="inventory_2"
          accent="primary"
          loading={month.isLoading}
          value={monthItems}
          hint="This month"
        />
        <StatCard
          label="Avg / Purchase"
          icon="bar_chart"
          accent="tertiary"
          loading={month.isLoading}
          value={currency(monthRows.length ? monthTotal / monthRows.length : 0)}
          hint="This month"
        />
      </div>

      <Card>
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message={extractMessage(error)} onRetry={refetch} />
        ) : data!.data.length === 0 ? (
          <EmptyState
            icon="business_center"
            title="No office purchases yet"
            description="Record items you bought for the office to track internal-use spending."
            action={<Button icon="add" onClick={() => setCreateOpen(true)}>New Office Purchase</Button>}
          />
        ) : (
          <>
            <Table>
              <THead>
                <TH>Date</TH>
                <TH>Supplier</TH>
                <TH>Items</TH>
                <TH>Recorded by</TH>
                <TH align="right">Total</TH>
              </THead>
              <TBody>
                {data!.data.map((e) => (
                  <TR key={e.id} onClick={() => navigate(`/office-purchases/${e.id}`)}>
                    <TD>{formatDate(e.expenseDate)}</TD>
                    <TD>{e.supplierName || '—'}</TD>
                    <TD className="max-w-xs truncate text-on-surface-variant">
                      {itemsSummary(e)}
                    </TD>
                    <TD className="text-on-surface-variant">{e.user?.fullName ?? '—'}</TD>
                    <TD align="right" className="font-mono-data font-bold text-error">
                      −{currency(e.amount)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination meta={data!.meta} onPage={setPage} />
          </>
        )}
      </Card>

      <CreateOfficePurchaseModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

function itemsSummary(e: Expense): string {
  const items = e.items ?? [];
  if (items.length === 0) return '—';
  const first = items[0].name;
  return items.length > 1 ? `${first} +${items.length - 1} more` : first;
}

interface DraftItem {
  key: string;
  name: string;
  quantity: string;
  unitCost: string;
}

const newDraft = (): DraftItem => ({
  key: crypto.randomUUID(),
  name: '',
  quantity: '1',
  unitCost: '',
});

function CreateOfficePurchaseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const create = useCreateOfficePurchase();
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [supplierName, setSupplierName] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<DraftItem[]>([newDraft()]);

  useEffect(() => {
    if (open) {
      setPurchaseDate(new Date().toISOString().slice(0, 10));
      setSupplierName('');
      setNotes('');
      setItems([newDraft()]);
    }
  }, [open]);

  const addRow = () => setItems((p) => [...p, newDraft()]);
  const updateRow = (key: string, patch: Partial<DraftItem>) =>
    setItems((p) => p.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const removeRow = (key: string) => setItems((p) => p.filter((i) => i.key !== key));

  const total = items.reduce((a, i) => a + num(i.quantity) * num(i.unitCost), 0);

  const submit = async () => {
    const valid = items.filter((i) => i.name.trim() && num(i.quantity) > 0 && num(i.unitCost) >= 0);
    if (valid.length === 0) {
      toast.error('Add at least one item', 'Enter an item name, quantity and unit cost.');
      return;
    }
    const payloadItems: OfficePurchaseItemInput[] = valid.map((i) => ({
      name: i.name.trim(),
      quantity: parseInt(i.quantity, 10),
      unitCost: num(i.unitCost),
    }));
    try {
      await create.mutateAsync({
        purchaseDate: new Date(purchaseDate).toISOString(),
        supplierName: supplierName.trim() || undefined,
        description: notes.trim() || undefined,
        items: payloadItems,
      });
      toast.success('Office purchase recorded', `${valid.length} item(s) · ${currency(total)}`);
      onClose();
    } catch (e) {
      toast.error('Failed to record', extractMessage(e));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="New Office Purchase"
      subtitle="Goods for internal use — booked as a cost, not added to sellable stock"
      footer={
        <>
          <div className="mr-auto text-body-sm text-on-surface-variant">
            Total: <span className="font-mono-data font-bold text-on-surface">{currency(total)}</span>
          </div>
          <Button variant="outline" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending} icon="check">
            Record Purchase
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Date" required>
            <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
          </Field>
          <Field label="Supplier / vendor" hint="optional">
            <Input
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              placeholder="e.g. Acme Supplies"
            />
          </Field>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-label-caps uppercase tracking-wide text-on-surface-variant">Items</span>
            <Button size="sm" variant="ghost" icon="add" onClick={addRow}>
              Add line
            </Button>
          </div>
          <div className="space-y-2">
            {items.map((row) => {
              const lineTotal = num(row.quantity) * num(row.unitCost);
              return (
                <div key={row.key} className="flex flex-wrap items-end gap-2 rounded-xl border border-outline-variant p-2.5">
                  <Field label="Item" className="min-w-[180px] flex-1">
                    <Input
                      value={row.name}
                      onChange={(e) => updateRow(row.key, { name: e.target.value })}
                      placeholder="e.g. Printer paper"
                    />
                  </Field>
                  <Field label="Qty" className="w-20">
                    <Input
                      type="number"
                      min="1"
                      value={row.quantity}
                      onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                    />
                  </Field>
                  <Field label="Unit cost" className="w-32">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.unitCost}
                      onChange={(e) => updateRow(row.key, { unitCost: e.target.value })}
                    />
                  </Field>
                  <div className="w-28 pb-2.5 text-right font-mono-data text-body-sm font-semibold">
                    {currency(lineTotal)}
                  </div>
                  <button
                    onClick={() => removeRow(row.key)}
                    disabled={items.length === 1}
                    className="mb-1.5 rounded-lg p-2 text-on-surface-variant hover:bg-surface-container hover:text-error disabled:opacity-30"
                  >
                    <Icon name="delete" size={18} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes…" />
        </Field>
      </div>
    </Modal>
  );
}

