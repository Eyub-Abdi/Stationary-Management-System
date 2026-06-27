import { useEffect, useMemo, useState } from 'react';
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
  Select,
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
  useCreatePurchase,
  usePurchase,
  usePurchases,
  type PurchaseItemInput,
} from '@/hooks/usePurchases';
import { useProducts } from '@/hooks/useProducts';
import { useSuppliers } from '@/hooks/useCatalog';
import { extractMessage } from '@/lib/api';
import { currency, formatDate, num } from '@/lib/utils';
import type { PaymentMethod, Product, SellUnit } from '@/types';

export default function PurchasesPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch, error } = usePurchases({
    page,
    limit: 12,
    search: search || undefined,
  });

  return (
    <div className="flex flex-col gap-gutter">
      <PageHeader
        title="Purchases"
        description="Record stock received from suppliers — pay cash or on credit, by piece or by pack."
        actions={
          <Button icon="add" onClick={() => setCreateOpen(true)}>
            New Purchase
          </Button>
        }
      />

      <Card>
        <div className="border-b border-outline-variant p-4">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search by purchase number…"
            className="max-w-md"
          />
        </div>

        {isLoading ? (
          <LoadingState label="Loading purchases…" />
        ) : isError ? (
          <ErrorState message={extractMessage(error)} onRetry={refetch} />
        ) : data!.data.length === 0 ? (
          <EmptyState
            icon="shopping_cart"
            title="No purchases recorded"
            description="Record your first stock purchase to build inventory."
            action={<Button icon="add" onClick={() => setCreateOpen(true)}>New Purchase</Button>}
          />
        ) : (
          <>
            <Table>
              <THead>
                <TH>Purchase #</TH>
                <TH>Supplier</TH>
                <TH>Date</TH>
                <TH>Payment</TH>
                <TH align="right">Total Cost</TH>
                <TH align="right">Owing</TH>
                <TH align="right">Action</TH>
              </THead>
              <TBody>
                {data!.data.map((p) => (
                  <TR key={p.id} onClick={() => setDetailsId(p.id)}>
                    <TD className="font-mono-data text-primary">{p.purchaseNumber}</TD>
                    <TD>{p.supplier?.name ?? 'Walk-in / Direct'}</TD>
                    <TD>{formatDate(p.purchaseDate)}</TD>
                    <TD>
                      <Badge tone={p.paymentMethod === 'CREDIT' ? 'warning' : 'neutral'}>
                        {p.paymentMethod === 'CREDIT' ? 'Credit' : 'Cash'}
                      </Badge>
                    </TD>
                    <TD align="right" className="font-mono-data font-semibold">{currency(p.totalCost)}</TD>
                    <TD align="right" className="font-mono-data">
                      {num(p.amountDue) > 0 ? (
                        <span className="font-semibold text-error">{currency(p.amountDue)}</span>
                      ) : (
                        <span className="text-on-surface-variant">—</span>
                      )}
                    </TD>
                    <TD align="right">
                      <Icon name="chevron_right" size={20} className="text-on-surface-variant" />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination meta={data!.meta} onPage={setPage} />
          </>
        )}
      </Card>

      <CreatePurchaseModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <PurchaseDetailsModal id={detailsId} onClose={() => setDetailsId(null)} />
    </div>
  );
}

interface DraftItem {
  key: string;
  variantId: string;
  sellUnit: SellUnit;
  quantity: string;
  unitCost: string;
}

function CreatePurchaseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const create = useCreatePurchase();
  const { data: products } = useProducts({ status: 'ACTIVE', limit: 100 });
  const { data: suppliers } = useSuppliers({ limit: 100 });

  // Flatten products → one option per active variant.
  const variantOptions = useMemo(
    () =>
      (products?.data ?? []).flatMap((p) =>
        p.variants
          .filter((v) => v.status === 'ACTIVE')
          .map((v) => ({
            variantId: v.id,
            product: p,
            label:
              v.label && v.label !== 'Default'
                ? `${p.name} — ${v.label} (${v.sku})`
                : `${p.name} (${v.sku})`,
          })),
      ),
    [products],
  );
  const variantById = useMemo(
    () => new Map(variantOptions.map((o) => [o.variantId, o] as const)),
    [variantOptions],
  );

  const [supplierId, setSupplierId] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payment, setPayment] = useState<PaymentMethod>('CASH');
  const [amountPaid, setAmountPaid] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<DraftItem[]>([]);

  useEffect(() => {
    if (open) {
      setSupplierId('');
      setPurchaseDate(new Date().toISOString().slice(0, 10));
      setPayment('CASH');
      setAmountPaid('');
      setNotes('');
      setItems([{ key: crypto.randomUUID(), variantId: '', sellUnit: 'BASE', quantity: '1', unitCost: '' }]);
    }
  }, [open]);

  const addRow = () =>
    setItems((p) => [
      ...p,
      { key: crypto.randomUUID(), variantId: '', sellUnit: 'BASE', quantity: '1', unitCost: '' },
    ]);
  const updateRow = (key: string, patch: Partial<DraftItem>) =>
    setItems((p) => p.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const removeRow = (key: string) => setItems((p) => p.filter((i) => i.key !== key));

  const total = items.reduce((a, i) => a + num(i.quantity) * num(i.unitCost), 0);
  const paid = payment === 'CASH' ? total : num(amountPaid);
  const owing = Math.max(0, total - paid);

  const submit = async () => {
    const valid = items.filter((i) => i.variantId && num(i.quantity) > 0 && num(i.unitCost) >= 0);
    if (valid.length === 0) {
      toast.error('Add at least one item', 'Select a product, quantity and unit cost.');
      return;
    }
    if (payment === 'CREDIT' && !supplierId) {
      toast.error('Supplier required', 'Credit purchases must be tied to a supplier.');
      return;
    }
    if (payment === 'CREDIT' && num(amountPaid) > total) {
      toast.error('Amount paid too high', 'Amount paid cannot exceed the total cost.');
      return;
    }
    const payloadItems: PurchaseItemInput[] = valid.map((i) => ({
      variantId: i.variantId,
      sellUnit: i.sellUnit,
      quantity: parseInt(i.quantity, 10),
      unitCost: num(i.unitCost),
    }));
    try {
      await create.mutateAsync({
        supplierId: supplierId || undefined,
        purchaseDate: new Date(purchaseDate).toISOString(),
        paymentMethod: payment,
        amountPaid: payment === 'CREDIT' ? num(amountPaid) || 0 : undefined,
        notes: notes.trim() || undefined,
        items: payloadItems,
      });
      toast.success('Purchase recorded', `${valid.length} item(s) added to inventory.`);
      onClose();
    } catch (e) {
      toast.error('Failed to record purchase', extractMessage(e));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="New Purchase"
      subtitle="Stock received creates FIFO inventory batches automatically"
      footer={
        <>
          <div className="mr-auto text-body-sm text-on-surface-variant">
            Total: <span className="font-mono-data font-bold text-on-surface">{currency(total)}</span>
            {payment === 'CREDIT' && owing > 0 && (
              <>
                {' · '}Owing: <span className="font-mono-data font-bold text-error">{currency(owing)}</span>
              </>
            )}
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
          <Field label="Supplier" required={payment === 'CREDIT'}>
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Direct / Walk-in</option>
              {suppliers?.data.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Purchase date" required>
            <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Payment">
            <SegmentedControl
              value={payment}
              onChange={(v) => setPayment(v)}
              items={[
                { value: 'CASH', label: 'Cash (paid in full)' },
                { value: 'CREDIT', label: 'Credit (owe supplier)' },
              ]}
            />
          </Field>
          {payment === 'CREDIT' && (
            <Field label="Amount paid now" hint={`Owing: ${currency(owing)}`}>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amountPaid}
                placeholder="0"
                onChange={(e) => setAmountPaid(e.target.value)}
              />
            </Field>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-label-caps uppercase tracking-wide text-on-surface-variant">Line items</span>
            <Button size="sm" variant="ghost" icon="add" onClick={addRow}>
              Add line
            </Button>
          </div>
          <div className="space-y-2">
            {items.map((row) => {
              const product = row.variantId ? variantById.get(row.variantId)?.product : undefined;
              const hasBulk = !!product?.bulkUnit && product.unitSize > 1;
              const lineTotal = num(row.quantity) * num(row.unitCost);
              return (
                <div key={row.key} className="flex flex-wrap items-end gap-2 rounded-xl border border-outline-variant p-2.5">
                  <Field label="Product / variant" className="min-w-[180px] flex-1">
                    <Select
                      value={row.variantId}
                      onChange={(e) => updateRow(row.key, { variantId: e.target.value, sellUnit: 'BASE' })}
                    >
                      <option value="">Select variant…</option>
                      {variantOptions.map((o) => (
                        <option key={o.variantId} value={o.variantId}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  {hasBulk && (
                    <Field label="Unit" className="w-36">
                      <Select value={row.sellUnit} onChange={(e) => updateRow(row.key, { sellUnit: e.target.value as SellUnit })}>
                        <option value="BASE">{product!.baseUnit}</option>
                        <option value="BULK">{product!.bulkUnit} (×{product!.unitSize})</option>
                      </Select>
                    </Field>
                  )}
                  <Field label="Qty" className="w-20">
                    <Input
                      type="number"
                      min="1"
                      value={row.quantity}
                      onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                    />
                  </Field>
                  <Field label={`Cost / ${unitLabelOf(product, row.sellUnit)}`} className="w-32">
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

function unitLabelOf(product: Product | undefined, sellUnit: SellUnit): string {
  if (!product) return 'unit';
  return sellUnit === 'BULK' && product.bulkUnit ? product.bulkUnit : product.baseUnit;
}

function PurchaseDetailsModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isLoading } = usePurchase(id ?? undefined);
  return (
    <Modal open={!!id} onClose={onClose} size="lg" title="Purchase Details" subtitle={data?.purchaseNumber}>
      {isLoading || !data ? (
        <LoadingState />
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
          <div className="space-y-2 rounded-xl bg-surface-container-low px-4 py-3">
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
