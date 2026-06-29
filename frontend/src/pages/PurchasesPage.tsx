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
import { useCreateUnit, useSuppliers, useUnits } from '@/hooks/useCatalog';
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

interface DraftLine {
  variantId: string;
  label: string;
  quantity: string;
  unitCost: string;
  sellingPrice: string;
  wholesalePrice: string;
  hadPrice: boolean;
}

interface DraftProduct {
  key: string;
  productId: string;
  sellUnit: SellUnit;
  packName: string;
  packSize: string;
  lines: DraftLine[];
}

const newDraft = (): DraftProduct => ({
  key: crypto.randomUUID(),
  productId: '',
  sellUnit: 'BASE',
  packName: '',
  packSize: '',
  lines: [],
});

/** Builds editable lines from a product's active variants, prefilling the price tag. */
const linesFromProduct = (p: Product): DraftLine[] =>
  p.variants
    .filter((v) => v.status === 'ACTIVE')
    .map((v) => ({
      variantId: v.id,
      label: v.label && v.label !== 'Default' ? v.label : '—',
      quantity: '',
      unitCost: '',
      sellingPrice: num(v.sellingPrice) > 0 ? num(v.sellingPrice).toString() : '',
      wholesalePrice: v.wholesalePrice && num(v.wholesalePrice) > 0 ? num(v.wholesalePrice).toString() : '',
      hadPrice: num(v.sellingPrice) > 0,
    }));

function CreatePurchaseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const create = useCreatePurchase();
  const { data: products } = useProducts({ status: 'ACTIVE', limit: 100 });
  const { data: suppliers } = useSuppliers({ limit: 100 });
  const { data: units } = useUnits();
  const createUnit = useCreateUnit();

  const productOptions = useMemo(
    () => (products?.data ?? []).filter((p) => p.variants.some((v) => v.status === 'ACTIVE')),
    [products],
  );
  const productById = useMemo(
    () => new Map(productOptions.map((p) => [p.id, p] as const)),
    [productOptions],
  );

  const [supplierId, setSupplierId] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payment, setPayment] = useState<PaymentMethod>('CASH');
  const [amountPaid, setAmountPaid] = useState('');
  const [notes, setNotes] = useState('');
  const [cards, setCards] = useState<DraftProduct[]>([]);
  // Inline "register a new unit" (mirrors the category picker on products).
  const [addingUnitFor, setAddingUnitFor] = useState<string | null>(null);
  const [newUnitName, setNewUnitName] = useState('');

  useEffect(() => {
    if (open) {
      setSupplierId('');
      setPurchaseDate(new Date().toISOString().slice(0, 10));
      setPayment('CASH');
      setAmountPaid('');
      setNotes('');
      setCards([newDraft()]);
    }
  }, [open]);

  const addRow = () => setCards((p) => [...p, newDraft()]);
  const updateCard = (key: string, patch: Partial<DraftProduct>) =>
    setCards((p) => p.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const removeRow = (key: string) => setCards((p) => p.filter((c) => c.key !== key));
  const updateLine = (key: string, variantId: string, patch: Partial<DraftLine>) =>
    setCards((p) =>
      p.map((c) =>
        c.key === key
          ? { ...c, lines: c.lines.map((l) => (l.variantId === variantId ? { ...l, ...patch } : l)) }
          : c,
      ),
    );

  // Choosing a product loads all its active variants, prefilling their price tags.
  const pickProduct = (key: string, productId: string) => {
    const p = productById.get(productId);
    updateCard(key, { productId, sellUnit: 'BASE', lines: p ? linesFromProduct(p) : [] });
  };

  // Register a new unit on the fly and select it for the card being edited.
  const addUnit = async (cardKey: string) => {
    const name = newUnitName.trim();
    if (!name) {
      toast.error('Name required', 'Enter a unit name (e.g. Box).');
      return;
    }
    try {
      const created = await createUnit.mutateAsync({ name });
      updateCard(cardKey, { packName: created.name });
      setNewUnitName('');
      setAddingUnitFor(null);
      toast.success('Unit added', created.name);
    } catch (e) {
      toast.error('Could not add unit', extractMessage(e));
    }
  };

  const allLines = cards.flatMap((c) => c.lines.map((l) => ({ card: c, line: l })));
  const total = allLines.reduce((a, { line }) => a + num(line.quantity) * num(line.unitCost), 0);
  const paid = payment === 'CASH' ? total : num(amountPaid);
  const owing = Math.max(0, total - paid);

  const submit = async () => {
    const valid = allLines.filter(
      ({ line }) => line.variantId && num(line.quantity) > 0 && num(line.unitCost) >= 0,
    );
    if (valid.length === 0) {
      toast.error('Add at least one item', 'Pick a product, then enter quantity and unit cost.');
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
    // Packs need a pieces-per-pack count (2+) to convert into stock.
    const badPack = valid.find(({ card }) => card.sellUnit === 'BULK' && num(card.packSize) < 2);
    if (badPack) {
      const p = productById.get(badPack.card.productId);
      toast.error('Pack size needed', `Enter how many pieces are in each pack for ${p?.name ?? 'this product'} (2 or more).`);
      return;
    }
    // A variant that has never been priced must get a selling price here.
    const missing = valid.find(({ line }) => line.sellingPrice.trim() === '' && !line.hadPrice);
    if (missing) {
      const p = productById.get(missing.card.productId);
      const name = p ? `${p.name} (${missing.line.label})` : 'this item';
      toast.error('Selling price needed', `Set a selling price for ${name} — it has no price yet.`);
      return;
    }
    const payloadItems: PurchaseItemInput[] = valid.map(({ card, line }) => ({
      variantId: line.variantId,
      sellUnit: card.sellUnit,
      quantity: parseInt(line.quantity, 10),
      ...(card.sellUnit === 'BULK'
        ? { unitSize: parseInt(card.packSize, 10), unitLabel: card.packName.trim() || 'pack' }
        : {}),
      unitCost: num(line.unitCost),
      sellingPrice: line.sellingPrice.trim() === '' ? undefined : num(line.sellingPrice),
      wholesalePrice: line.wholesalePrice.trim() === '' ? undefined : num(line.wholesalePrice),
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
            <span className="text-label-caps uppercase tracking-wide text-on-surface-variant">Products received</span>
            <Button size="sm" variant="ghost" icon="add" onClick={addRow}>
              Add product
            </Button>
          </div>
          <div className="space-y-3">
            {cards.map((card) => {
              const product = card.productId ? productById.get(card.productId) : undefined;
              const isPack = card.sellUnit === 'BULK';
              const costUnit = isPack ? card.packName.trim() || 'pack' : product?.baseUnit ?? 'pcs';
              const taken = new Set(
                cards.filter((c) => c.key !== card.key && c.productId).map((c) => c.productId),
              );
              const cols = 'minmax(90px,1.2fr) 84px 128px 128px 128px 96px';
              return (
                <div key={card.key} className="rounded-xl border border-outline-variant p-3">
                  {/* Card header: which product, and how it was received */}
                  <div className="flex flex-wrap items-end gap-2">
                    <Field label="Product" className="min-w-[200px] flex-1">
                      <Select value={card.productId} onChange={(e) => pickProduct(card.key, e.target.value)}>
                        <option value="">Select product…</option>
                        {productOptions.map((p) => (
                          <option key={p.id} value={p.id} disabled={taken.has(p.id)}>
                            {p.name} ({p.sku})
                          </option>
                        ))}
                      </Select>
                    </Field>
                    {product && (
                      <Field label="Received as" className="w-32">
                        <Select
                          value={card.sellUnit}
                          onChange={(e) => updateCard(card.key, { sellUnit: e.target.value as SellUnit })}
                        >
                          <option value="BASE">By {product.baseUnit}</option>
                          <option value="BULK">By pack</option>
                        </Select>
                      </Field>
                    )}
                    {product && isPack && (
                      <>
                        <Field label="Pack unit" className="w-44">
                          {addingUnitFor === card.key ? (
                            <div className="flex gap-1">
                              <Input
                                autoFocus
                                value={newUnitName}
                                onChange={(e) => setNewUnitName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    void addUnit(card.key);
                                  }
                                }}
                                placeholder="New unit"
                              />
                              <Button
                                type="button"
                                size="sm"
                                icon="check"
                                loading={createUnit.isPending}
                                onClick={() => addUnit(card.key)}
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                icon="close"
                                onClick={() => {
                                  setAddingUnitFor(null);
                                  setNewUnitName('');
                                }}
                              />
                            </div>
                          ) : (
                            <div className="flex gap-1">
                              <Select
                                className="flex-1"
                                value={card.packName}
                                onChange={(e) => updateCard(card.key, { packName: e.target.value })}
                              >
                                <option value="">Select unit…</option>
                                {(units ?? []).map((u) => (
                                  <option key={u.id} value={u.name}>
                                    {u.name}
                                  </option>
                                ))}
                              </Select>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                icon="add"
                                title="Add a new unit"
                                onClick={() => {
                                  setNewUnitName('');
                                  setAddingUnitFor(card.key);
                                }}
                              />
                            </div>
                          )}
                        </Field>
                        <Field label="Pcs per pack" className="w-28">
                          <Input
                            type="number"
                            min="2"
                            value={card.packSize}
                            placeholder="12"
                            onChange={(e) => updateCard(card.key, { packSize: e.target.value })}
                          />
                        </Field>
                      </>
                    )}
                    <button
                      onClick={() => removeRow(card.key)}
                      disabled={cards.length === 1}
                      title="Remove product"
                      className="mb-1.5 rounded-lg p-2 text-on-surface-variant hover:bg-surface-container hover:text-error disabled:opacity-30"
                    >
                      <Icon name="delete" size={18} />
                    </button>
                  </div>

                  {product && card.lines.length > 0 && (
                    <div className="mt-3 overflow-x-auto">
                      <div className="min-w-[560px] space-y-1.5">
                        {/* Group headers: buying vs selling */}
                        <div className="grid gap-2 text-[10px] font-bold uppercase tracking-wide" style={{ gridTemplateColumns: cols }}>
                          <span />
                          <span className="col-span-2 text-on-surface-variant">Buying</span>
                          <span className="col-span-2 border-l border-outline-variant pl-2 text-on-surface-variant">
                            Selling price (tag)
                          </span>
                          <span />
                        </div>
                        {/* Column labels */}
                        <div className="grid gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant" style={{ gridTemplateColumns: cols }}>
                          <span>Variant</span>
                          <span>Qty</span>
                          <span>Cost / {costUnit}</span>
                          <span className="border-l border-outline-variant pl-2">Retail / {product.baseUnit}</span>
                          <span>Wholesale / {product.baseUnit}</span>
                          <span className="text-right">Total</span>
                        </div>
                        {/* Variant rows */}
                        {card.lines.map((line) => {
                          const lineTotal = num(line.quantity) * num(line.unitCost);
                          return (
                            <div key={line.variantId} className="grid items-center gap-2" style={{ gridTemplateColumns: cols }}>
                              <span className="truncate text-[13px] font-medium text-on-surface">{line.label}</span>
                              <Input
                                type="number"
                                min="0"
                                value={line.quantity}
                                placeholder="0"
                                onChange={(e) => updateLine(card.key, line.variantId, { quantity: e.target.value })}
                              />
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={line.unitCost}
                                placeholder="Cost"
                                onChange={(e) => updateLine(card.key, line.variantId, { unitCost: e.target.value })}
                              />
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                className="border-dashed bg-surface-container-low/40"
                                value={line.sellingPrice}
                                placeholder="Retail"
                                onChange={(e) => updateLine(card.key, line.variantId, { sellingPrice: e.target.value })}
                              />
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                className="border-dashed bg-surface-container-low/40"
                                value={line.wholesalePrice}
                                placeholder="Wholesale"
                                onChange={(e) => updateLine(card.key, line.variantId, { wholesalePrice: e.target.value })}
                              />
                              <span className="text-right font-mono-data text-body-sm font-semibold">
                                {currency(lineTotal)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
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
