import { useMemo, useState } from 'react';
import {
  Breadcrumbs,
  Button,
  Card,
  Combobox,
  EmptyState,
  Field,
  Icon,
  Input,
  LoadingState,
  PageHeader,
  Select,
  Table,
  TBody,
  TD,
  Textarea,
  TH,
  THead,
  TR,
} from '@/components/ui';
import { useToast } from '@/providers/ToastProvider';
import {
  useOpeningStock,
  useRecordOpeningStock,
  type OpeningStockItemInput,
} from '@/hooks/useInventory';
import { useProducts } from '@/hooks/useProducts';
import { useUnits } from '@/hooks/useCatalog';
import { extractMessage } from '@/lib/api';
import { currency, formatDateTime, num } from '@/lib/utils';
import type { Product } from '@/types';

/**
 * The shelf as it stood on the day the shop started using the system.
 *
 * It reads like a purchase because that is what whoever is setting the shop up
 * has in front of them — a shelf count, in packs, with what each pack cost. The
 * difference is what happens afterwards: no money comes out of today's till,
 * and nothing is booked as a loss. Entering this as a purchase left the drawer
 * expecting tens of millions it never held; entering it as a stock adjustment
 * showed the same figure as profit the shop never made.
 */

interface DraftLine {
  variantId: string;
  label: string;
  currentStock: number;
  baseUnit: string;
  /** '' = loose pieces; otherwise the name of the pack it came in. */
  packName: string;
  packSize: string;
  quantity: string;
  /** What the whole line cost, so nobody has to divide by hand. */
  totalCost: string;
  sellingPrice: string;
  wholesalePrice: string;
  hadPrice: boolean;
  alreadyRecorded: boolean;
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

const linesFromProduct = (p: Product, done: Set<string>): DraftLine[] =>
  p.variants
    .filter((v) => v.status === 'ACTIVE')
    .map((v) => ({
      variantId: v.id,
      label: v.label && v.label !== 'Default' ? v.label : '—',
      currentStock: v.currentStock,
      baseUnit: p.baseUnit,
      packName: '',
      packSize: '',
      quantity: '',
      totalCost: '',
      sellingPrice: num(v.sellingPrice) > 0 ? num(v.sellingPrice).toString() : '',
      wholesalePrice:
        v.wholesalePrice && num(v.wholesalePrice) > 0 ? num(v.wholesalePrice).toString() : '',
      hadPrice: num(v.sellingPrice) > 0,
      alreadyRecorded: done.has(v.id),
    }));

/** Pieces this line puts on the shelf (a pack multiplies by its size). */
function pieces(line: DraftLine): number {
  const qty = num(line.quantity);
  return line.packName ? qty * num(line.packSize) : qty;
}

/** Cost of one piece — what FIFO consumes in, and what COGS is read from. */
function costPerPiece(line: DraftLine): number {
  const n = pieces(line);
  return n > 0 ? num(line.totalCost) / n : 0;
}

/** Cost of one transacted unit (a pack, or a piece) — what the API stores. */
function costPerUnit(line: DraftLine): number {
  const qty = num(line.quantity);
  return qty > 0 ? num(line.totalCost) / qty : 0;
}

export default function OpeningStockPage() {
  const toast = useToast();
  const record = useRecordOpeningStock();
  const recorded = useOpeningStock();
  const { data: products } = useProducts({ status: 'ACTIVE', limit: 100 });
  const { data: units } = useUnits();

  const productOptions = useMemo(
    () => (products?.data ?? []).filter((p) => p.variants.some((v) => v.status === 'ACTIVE')),
    [products],
  );
  const productById = useMemo(
    () => new Map(productOptions.map((p) => [p.id, p] as const)),
    [productOptions],
  );
  // Variants whose opening stock is already in. The API refuses a second one,
  // so say so on the form rather than at the end of a long entry session.
  const done = useMemo(
    () => new Set((recorded.data ?? []).map((r) => r.variantId)),
    [recorded.data],
  );

  const [countedAt, setCountedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [cards, setCards] = useState<DraftProduct[]>([newDraft()]);

  const addRow = () => setCards((p) => [...p, newDraft()]);
  const updateCard = (key: string, patch: Partial<DraftProduct>) =>
    setCards((p) => p.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const removeRow = (key: string) =>
    setCards((p) => (p.length === 1 ? [newDraft()] : p.filter((c) => c.key !== key)));
  const updateLine = (key: string, variantId: string, patch: Partial<DraftLine>) =>
    setCards((p) =>
      p.map((c) =>
        c.key === key
          ? { ...c, lines: c.lines.map((l) => (l.variantId === variantId ? { ...l, ...patch } : l)) }
          : c,
      ),
    );

  const pickProduct = (key: string, productId: string) => {
    const p = productById.get(productId);
    updateCard(key, { productId, lines: p ? linesFromProduct(p, done) : [] });
  };

  const allLines = cards.flatMap((c) => c.lines.map((l) => ({ card: c, line: l })));
  const filled = allLines.filter(
    ({ line }) => !line.alreadyRecorded && num(line.quantity) > 0,
  );
  const openingValue = filled.reduce((a, { line }) => a + num(line.totalCost), 0);

  const recordedValue = (recorded.data ?? []).reduce((a, r) => a + num(r.value), 0);

  const submit = async () => {
    if (filled.length === 0) {
      toast.error(
        'Nothing to record',
        'Pick a product, then enter how much is on the shelf and what it cost.',
      );
      return;
    }
    const badPack = filled.find(({ line }) => line.packName && num(line.packSize) < 2);
    if (badPack) {
      const p = productById.get(badPack.card.productId);
      toast.error(
        'Pack size needed',
        `Enter how many ${badPack.line.baseUnit} are in each ${badPack.line.packName} for ` +
          `${p?.name ?? 'this product'} (${badPack.line.label}). It must be 2 or more.`,
      );
      return;
    }
    const unpriced = filled.find(
      ({ line }) => line.sellingPrice.trim() === '' && !line.hadPrice,
    );
    if (unpriced) {
      const p = productById.get(unpriced.card.productId);
      toast.error(
        'Selling price needed',
        `Set a selling price for ${p?.name ?? 'this item'} (${unpriced.line.label}). ` +
          'It cannot be sold at the counter without one.',
      );
      return;
    }
    // The mistake worth catching here rather than in a batch: a pack price left
    // in the per-piece field values the shelf at many times what it cost.
    const overpriced = filled.find(({ line }) => {
      const price = num(line.sellingPrice);
      return price > 0 && costPerPiece(line) > price;
    });
    if (overpriced) {
      const p = productById.get(overpriced.card.productId);
      toast.error(
        'Cost is above the selling price',
        `${p?.name ?? 'This item'} works out at ${currency(costPerPiece(overpriced.line))} per ` +
          `${overpriced.line.baseUnit}, more than the ${currency(overpriced.line.sellingPrice)} it sells for. ` +
          'Check the quantity and the total cost.',
      );
      return;
    }

    const items: OpeningStockItemInput[] = filled.map(({ line }) => ({
      variantId: line.variantId,
      quantity: parseInt(line.quantity, 10),
      ...(line.packName
        ? { unitSize: parseInt(line.packSize, 10), unitLabel: line.packName }
        : {}),
      unitCost: Math.round(costPerUnit(line) * 100) / 100,
      sellingPrice: line.sellingPrice.trim() === '' ? undefined : num(line.sellingPrice),
      wholesalePrice: line.wholesalePrice.trim() === '' ? undefined : num(line.wholesalePrice),
    }));

    try {
      const result = await record.mutateAsync({
        items,
        countedAt: new Date(countedAt).toISOString(),
        notes: notes.trim() || undefined,
      });
      toast.success(
        'Opening stock recorded',
        `${result.lineCount} item(s) worth ${currency(result.totalValue)} are on the books. ` +
          'No cash left the till and nothing was booked as a loss.',
      );
      setCards([newDraft()]);
      setNotes('');
    } catch (e) {
      toast.error('Could not record opening stock', extractMessage(e));
    }
  };

  return (
    <div className="flex flex-col gap-gutter pb-24">
      <div>
        <Breadcrumbs
          className="mb-3"
          items={[
            { label: 'Home', to: '/' },
            { label: 'Inventory', to: '/inventory' },
            { label: 'Opening stock' },
          ]}
        />
        <PageHeader
          title="Opening Stock"
          description="What was already on the shelf when the shop started using the system."
        />
      </div>

      {/* The whole reason this screen exists, said once, where it is read. */}
      <Card className="flex items-start gap-3 p-4">
        <Icon name="info" size={20} className="mt-0.5 shrink-0 text-primary" />
        <div className="text-body-sm text-on-surface-variant">
          <p className="font-semibold text-on-surface">Use this once, at setup.</p>
          <p className="mt-1">
            Stock entered here is costed properly, so profit on the first sales is right.
            No cash comes out of the till and nothing counts as wastage, because it was
            bought long before today. Record stock you buy from now on as a{' '}
            <span className="font-semibold text-on-surface">Purchase</span>, and a miscount as
            a <span className="font-semibold text-on-surface">stock count correction</span>.
          </p>
        </div>
      </Card>

      {/* 1 · When it was counted */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[12px] font-bold text-on-primary">
            1
          </span>
          <span className="text-label-caps uppercase tracking-wide text-on-surface-variant">
            Count date
          </span>
        </div>
        <Card className="p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Counted on"
              required
              hint="Dates the stock so it sells before anything bought after it"
            >
              <Input
                type="date"
                value={countedAt}
                onChange={(e) => setCountedAt(e.target.value)}
              />
            </Field>
            <Field label="Notes" hint="Optional">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Shelf count before opening"
              />
            </Field>
          </div>
        </Card>
      </section>

      {/* 2 · What is on the shelf */}
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[12px] font-bold text-on-primary">
              2
            </span>
            <span className="text-label-caps uppercase tracking-wide text-on-surface-variant">
              What is on the shelf
            </span>
          </div>
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
                    <Combobox
                      value={card.productId}
                      onChange={(id) => pickProduct(card.key, id)}
                      options={productOptions
                        .filter((p) => !taken.has(p.id))
                        .map((p) => ({ value: p.id, label: `${p.name} (${p.sku})` }))}
                      placeholder="Search a product…"
                    />
                  </Field>
                  <button
                    onClick={() => removeRow(card.key)}
                    title="Remove product"
                    className="mb-1.5 rounded-lg p-2 text-on-surface-variant hover:bg-surface-container hover:text-error"
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
      </section>

      {/* Already on the books */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <Icon name="history" size={16} className="text-on-surface-variant" />
          <span className="text-label-caps uppercase tracking-wide text-on-surface-variant">
            Already recorded
          </span>
        </div>
        <Card>
          {recorded.isLoading ? (
            <LoadingState />
          ) : (recorded.data ?? []).length === 0 ? (
            <EmptyState
              icon="flag"
              title="Nothing recorded yet"
              description="Opening stock you enter above appears here."
            />
          ) : (
            <>
              <Table>
                <THead>
                  <TH>Product</TH>
                  <TH>SKU</TH>
                  <TH align="right">Quantity</TH>
                  <TH align="right">Cost each</TH>
                  <TH align="right">Value</TH>
                  <TH>Recorded</TH>
                </THead>
                <TBody>
                  {(recorded.data ?? []).map((r) => (
                    <TR key={r.id}>
                      <TD>{r.name}</TD>
                      <TD className="font-mono-data text-on-surface-variant">{r.sku}</TD>
                      <TD align="right" className="font-mono-data">
                        {r.quantity} {r.baseUnit}
                      </TD>
                      <TD align="right" className="font-mono-data">
                        {r.unitCost ? currency(r.unitCost) : '—'}
                      </TD>
                      <TD align="right" className="font-mono-data font-semibold">
                        {currency(r.value)}
                      </TD>
                      <TD className="text-on-surface-variant">
                        {formatDateTime(r.createdAt)}
                        {r.recordedBy ? ` · ${r.recordedBy}` : ''}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <div className="flex justify-end border-t border-outline-variant p-4 text-body-sm">
                <span className="text-on-surface-variant">Opening value&nbsp;</span>
                <span className="font-mono-data font-bold text-on-surface">
                  {currency(recordedValue)}
                </span>
              </div>
            </>
          )}
        </Card>
      </section>

      {/* Sticky action bar — offset to clear the sidebar on desktop */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-outline-variant bg-surface-container-lowest/95 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 p-4 sm:px-container-padding">
          <div className="mr-auto text-body-sm text-on-surface-variant">
            Opening value:{' '}
            <span className="font-mono-data font-bold text-on-surface">
              {currency(openingValue)}
            </span>
            {filled.length > 0 && <> · {filled.length} item(s)</>}
          </div>
          <Button onClick={submit} loading={record.isPending} icon="check">
            Record Opening Stock
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
  const isPack = !!line.packName;
  const costUnit = isPack ? line.packName : line.baseUnit;
  const incoming = pieces(line);
  const perPiece = costPerPiece(line);
  const perUnit = costPerUnit(line);
  const price = num(line.sellingPrice);
  // The pack-price-in-the-piece-field mistake, caught while it is still being
  // typed. A cost above the price is never right and always this.
  const costTooHigh = price > 0 && perPiece > price;

  if (line.alreadyRecorded) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-outline-variant p-3 text-body-sm text-on-surface-variant">
        <Icon name="check_circle" size={16} className="text-secondary" />
        <span className="font-semibold text-on-surface">{line.label}</span>
        <span>
          has its opening stock recorded already. Use a stock count correction to change it.
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-outline-variant p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-body-sm font-semibold text-on-surface">{line.label}</span>
        <span className="text-[12px] text-on-surface-variant">
          In stock:{' '}
          <span className="font-mono-data font-semibold text-on-surface">
            {line.currentStock}
          </span>{' '}
          {line.baseUnit}
          {incoming > 0 && (
            <span className="text-secondary">
              {' '}
              →{' '}
              <span className="font-mono-data font-semibold">
                {line.currentStock + incoming}
              </span>{' '}
              {line.baseUnit}
            </span>
          )}
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <Field label="Counted as" className="w-40">
          <Select
            value={line.packName || 'BASE'}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'BASE') onChange({ packName: '', packSize: '' });
              else onChange({ packName: v });
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
          <Field label={`${line.baseUnit}/${line.packName}`} className="w-24">
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
        <Field label="Total cost" hint={`for ${line.quantity || 0} ${costUnit}`} className="w-32">
          <Input
            type="number"
            min="0"
            step="0.01"
            value={line.totalCost}
            placeholder="What it cost"
            onChange={(e) => onChange({ totalCost: e.target.value })}
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
          <p className="text-[11px] uppercase tracking-wide text-on-surface-variant">
            Cost / {line.baseUnit}
          </p>
          <p
            className={`font-mono-data text-body-sm font-bold ${
              costTooHigh ? 'text-error' : 'text-primary'
            }`}
          >
            {currency(perPiece)}
          </p>
          {isPack && perUnit > 0 && (
            <p className="text-[11px] text-on-surface-variant">
              {currency(perUnit)} / {costUnit}
            </p>
          )}
        </div>
      </div>

      {costTooHigh && (
        <p className="mt-2 flex items-center gap-1.5 text-[12px] text-error">
          <Icon name="warning" size={14} />
          That is above the {currency(price)} selling price.
          {isPack
            ? ` Check the pack size (${line.packSize || '?'}).`
            : ` If this is a pack price, count it as a pack instead.`}
        </p>
      )}
    </div>
  );
}
