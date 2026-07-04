import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Breadcrumbs,
  Button,
  Card,
  Field,
  Icon,
  Input,
  PageHeader,
  SegmentedControl,
  Select,
  Textarea,
} from '@/components/ui';
import { useToast } from '@/providers/ToastProvider';
import { useCreatePurchase, type PurchaseItemInput } from '@/hooks/usePurchases';
import { useProducts } from '@/hooks/useProducts';
import { useSuppliers, useUnits } from '@/hooks/useCatalog';
import { extractMessage } from '@/lib/api';
import { currency, num } from '@/lib/utils';
import type { PaymentMethod, Product, SellUnit } from '@/types';

// A single variant line — now carries its own received-as unit, so different
// variants of the same product can arrive in different units (piece vs pack).
interface DraftLine {
  variantId: string;
  label: string;
  currentStock: number;
  baseUnit: string;
  sellUnit: SellUnit;
  packName: string;
  packSize: string;
  quantity: string;
  unitCost: string;
  sellingPrice: string;
  wholesalePrice: string;
  hadPrice: boolean;
}

interface DraftProduct {
  key: string;
  productId: string;
  lines: DraftLine[];
}

const newDraft = (): DraftProduct => ({
  key: crypto.randomUUID(),
  productId: '',
  lines: [],
});

/** Builds editable lines from a product's active variants, prefilling price + stock. */
const linesFromProduct = (p: Product): DraftLine[] =>
  p.variants
    .filter((v) => v.status === 'ACTIVE')
    .map((v) => ({
      variantId: v.id,
      label: v.label && v.label !== 'Default' ? v.label : '—',
      currentStock: v.currentStock,
      baseUnit: p.baseUnit,
      sellUnit: 'BASE' as SellUnit,
      packName: '',
      packSize: '',
      quantity: '',
      unitCost: '',
      sellingPrice: num(v.sellingPrice) > 0 ? num(v.sellingPrice).toString() : '',
      wholesalePrice: v.wholesalePrice && num(v.wholesalePrice) > 0 ? num(v.wholesalePrice).toString() : '',
      hadPrice: num(v.sellingPrice) > 0,
    }));

/** Base units this line adds to stock (packs multiply by pieces-per-pack). */
function incomingBase(line: DraftLine): number {
  const qty = num(line.quantity);
  return line.sellUnit === 'BULK' ? qty * num(line.packSize) : qty;
}

export default function CreatePurchasePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const create = useCreatePurchase();
  const { data: products } = useProducts({ status: 'ACTIVE', limit: 100 });
  const { data: suppliers } = useSuppliers({ limit: 100 });
  const { data: units } = useUnits();

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
  const [cards, setCards] = useState<DraftProduct[]>([newDraft()]);

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
    updateCard(key, { productId, lines: p ? linesFromProduct(p) : [] });
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
    // Packs need a pieces-per-pack count (2+) to convert into stock — now per variant.
    const badPack = valid.find(({ line }) => line.sellUnit === 'BULK' && num(line.packSize) < 2);
    if (badPack) {
      const p = productById.get(badPack.card.productId);
      toast.error(
        'Pack size needed',
        `Enter how many ${badPack.line.baseUnit} are in each pack for ${p?.name ?? 'this product'} (${badPack.line.label}) — 2 or more.`,
      );
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
    const payloadItems: PurchaseItemInput[] = valid.map(({ line }) => ({
      variantId: line.variantId,
      sellUnit: line.sellUnit,
      quantity: parseInt(line.quantity, 10),
      ...(line.sellUnit === 'BULK'
        ? { unitSize: parseInt(line.packSize, 10), unitLabel: line.packName.trim() || 'pack' }
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
      navigate('/purchases');
    } catch (e) {
      toast.error('Failed to record purchase', extractMessage(e));
    }
  };

  return (
    <div className="flex flex-col gap-gutter pb-24">
      <div>
        <Breadcrumbs
          className="mb-3"
          items={[
            { label: 'Home', to: '/' },
            { label: 'Purchases', to: '/purchases' },
            { label: 'New purchase' },
          ]}
        />
        <PageHeader
          title="New Purchase"
          description="Stock received creates FIFO inventory batches automatically."
        />
      </div>

      <Card className="space-y-5 p-4 sm:p-5">
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
      </Card>

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
            const taken = new Set(
              cards.filter((c) => c.key !== card.key && c.productId).map((c) => c.productId),
            );
            return (
              <Card key={card.key} className="p-3 sm:p-4">
                <div className="flex flex-wrap items-end gap-2">
                  <Field label="Product" className="min-w-[220px] flex-1">
                    <Select value={card.productId} onChange={(e) => pickProduct(card.key, e.target.value)}>
                      <option value="">Select product…</option>
                      {productOptions.map((p) => (
                        <option key={p.id} value={p.id} disabled={taken.has(p.id)}>
                          {p.name} ({p.sku})
                        </option>
                      ))}
                    </Select>
                  </Field>
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
                  <div className="mt-3 space-y-2.5">
                    {card.lines.map((line) => (
                      <VariantLine
                        key={line.variantId}
                        line={line}
                        units={(units ?? []).map((u) => u.name)}
                        onChange={(patch) => updateLine(card.key, line.variantId, patch)}
                      />
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      <Field label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes…" />
      </Field>

      {/* Sticky action bar — offset to clear the sidebar on desktop */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-outline-variant bg-surface-container-lowest/95 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 p-4 sm:px-container-padding">
          <div className="mr-auto text-body-sm text-on-surface-variant">
            Total: <span className="font-mono-data font-bold text-on-surface">{currency(total)}</span>
            {payment === 'CREDIT' && owing > 0 && (
              <>
                {' · '}Owing: <span className="font-mono-data font-bold text-error">{currency(owing)}</span>
              </>
            )}
          </div>
          <Button variant="outline" onClick={() => navigate('/purchases')} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending} icon="check">
            Record Purchase
          </Button>
        </div>
      </div>
    </div>
  );
}

function VariantLine({
  line,
  units,
  onChange,
}: {
  line: DraftLine;
  units: string[];
  onChange: (patch: Partial<DraftLine>) => void;
}) {
  const isPack = line.sellUnit === 'BULK';
  const costUnit = isPack ? line.packName.trim() || 'pack' : line.baseUnit;
  const incoming = incomingBase(line);
  const newStock = line.currentStock + incoming;

  return (
    <div className="rounded-xl border border-outline-variant p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-body-sm font-semibold text-on-surface">{line.label}</span>
        <span className="text-[12px] text-on-surface-variant">
          In stock: <span className="font-mono-data font-semibold text-on-surface">{line.currentStock}</span> {line.baseUnit}
          {incoming > 0 && (
            <span className="text-secondary">
              {' '}→ <span className="font-mono-data font-semibold">{newStock}</span> {line.baseUnit}
            </span>
          )}
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <Field label="Received as" className="w-40">
          <Select
            value={isPack ? line.packName : 'BASE'}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'BASE') onChange({ sellUnit: 'BASE', packName: '', packSize: '' });
              else onChange({ sellUnit: 'BULK', packName: v });
            }}
          >
            <option value="BASE">{line.baseUnit} (single)</option>
            {units.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </Field>
        {isPack && (
          <Field label={`${line.baseUnit}/${line.packName || 'pack'}`} className="w-24">
            <Input
              type="number"
              min="2"
              value={line.packSize}
              placeholder="12"
              onChange={(e) => onChange({ packSize: e.target.value })}
            />
          </Field>
        )}
        <Field label="Qty" className="w-20">
          <Input
            type="number"
            min="0"
            value={line.quantity}
            placeholder="0"
            onChange={(e) => onChange({ quantity: e.target.value })}
          />
        </Field>
        <Field label={`Cost / ${costUnit}`} className="w-32">
          <Input
            type="number"
            min="0"
            step="0.01"
            value={line.unitCost}
            placeholder="Cost"
            onChange={(e) => onChange({ unitCost: e.target.value })}
          />
        </Field>
        <Field label={`Retail / ${line.baseUnit}`} className="w-32">
          <Input
            type="number"
            min="0"
            step="0.01"
            className="border-dashed bg-surface-container-low/40"
            value={line.sellingPrice}
            placeholder="Retail"
            onChange={(e) => onChange({ sellingPrice: e.target.value })}
          />
        </Field>
        <Field label={`Wholesale / ${line.baseUnit}`} className="w-32">
          <Input
            type="number"
            min="0"
            step="0.01"
            className="border-dashed bg-surface-container-low/40"
            value={line.wholesalePrice}
            placeholder="Wholesale"
            onChange={(e) => onChange({ wholesalePrice: e.target.value })}
          />
        </Field>
        <div className="mb-1.5 ml-auto text-right">
          <p className="text-[11px] uppercase tracking-wide text-on-surface-variant">Line total</p>
          <p className="font-mono-data text-body-sm font-semibold">
            {currency(num(line.quantity) * num(line.unitCost))}
          </p>
        </div>
      </div>
    </div>
  );
}
