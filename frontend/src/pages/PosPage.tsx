import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  LoadingState,
  Modal,
  SearchInput,
  SegmentedControl,
  Select,
} from '@/components/ui';
import { useToast } from '@/providers/ToastProvider';
import { useActiveCashSession } from '@/providers/CashSessionProvider';
import { useProducts } from '@/hooks/useProducts';
import { useServices } from '@/hooks/useCatalog';
import { useCustomers } from '@/hooks/useCustomers';
import { useCreateSale, type SaleItemInput } from '@/hooks/useSales';
import { CustomerFormModal } from '@/features/customers/CustomerFormModal';
import { SERVICE_TYPE_ICON } from '@/lib/constants';
import { extractMessage } from '@/lib/api';
import { cn, currency, imageSrc, num } from '@/lib/utils';
import type { PaymentMethod, Product, Sale, SellUnit, Service } from '@/types';

interface CartLine {
  key: string;
  itemType: 'PRODUCT' | 'SERVICE';
  refId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  pages?: number; // PER_PAGE services
  perPage: boolean;
  discount: number;
  // dual-unit (products)
  sellUnit: SellUnit;
  baseUnit: string;
  bulkUnit: string | null;
  unitSize: number;
  basePrice: number;
  bulkPrice: number;
  stockBase?: number; // currentStock in base units (products)
}

function lineTotal(l: CartLine): number {
  const gross = l.perPage ? l.unitPrice * (l.pages || 1) * l.quantity : l.unitPrice * l.quantity;
  return Math.max(0, gross - l.discount);
}

/** Resolve unit price + max sellable quantity for a product line's chosen unit. */
function unitPricing(l: CartLine, sellUnit: SellUnit) {
  if (sellUnit === 'BULK') {
    return {
      unitPrice: l.bulkPrice,
      maxStock: l.stockBase !== undefined ? Math.floor(l.stockBase / l.unitSize) : undefined,
    };
  }
  return { unitPrice: l.basePrice, maxStock: l.stockBase };
}

export default function PosPage() {
  const toast = useToast();
  const { session } = useActiveCashSession();
  const createSale = useCreateSale();

  const [tab, setTab] = useState<'products' | 'services'>('products');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderDiscount, setOrderDiscount] = useState('');
  const [payment, setPayment] = useState<PaymentMethod>('CASH');
  const [customerId, setCustomerId] = useState('');
  const [cashReceived, setCashReceived] = useState('');
  const [notes, setNotes] = useState('');
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [unitPick, setUnitPick] = useState<Product | null>(null);
  const [custModalOpen, setCustModalOpen] = useState(false);
  const [view, setView] = useState<'grid' | 'list'>(
    () => (localStorage.getItem('pos-view') === 'list' ? 'list' : 'grid'),
  );
  useEffect(() => {
    localStorage.setItem('pos-view', view);
  }, [view]);

  const products = useProducts({ status: 'ACTIVE', limit: 50, search: tab === 'products' ? search || undefined : undefined });
  const services = useServices({ status: 'ACTIVE', limit: 50, search: tab === 'services' ? search || undefined : undefined });
  const customers = useCustomers({ limit: 100 });

  const subtotal = useMemo(() => cart.reduce((a, l) => a + lineTotal(l), 0), [cart]);
  const orderDisc = num(orderDiscount);
  const total = Math.max(0, subtotal - orderDisc);
  const received = num(cashReceived);
  const change = received - total;
  const creditBalance = Math.max(0, total - received);

  // Tapping a product: dual-unit items ask "pieces or pack?" first; single-unit
  // items add straight away.
  const addProduct = (p: Product) => {
    const hasBulk = !!p.bulkUnit && p.unitSize > 1;
    if (hasBulk) {
      setUnitPick(p);
      return;
    }
    addProductUnit(p, 'BASE');
  };

  /** Adds (or increments) a product line for the chosen unit of sale. */
  const addProductUnit = (p: Product, sellUnit: SellUnit) => {
    const basePrice = num(p.sellingPrice);
    const bulkPrice = p.bulkSellingPrice ? num(p.bulkSellingPrice) : basePrice * p.unitSize;
    const unitPrice = sellUnit === 'BULK' ? bulkPrice : basePrice;
    const maxStock = sellUnit === 'BULK' ? Math.floor(p.currentStock / p.unitSize) : p.currentStock;
    const unitName = sellUnit === 'BULK' && p.bulkUnit ? p.bulkUnit : p.baseUnit;
    // Same product sold in a different unit is a separate line.
    const key = `P-${p.id}-${sellUnit}`;

    setCart((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        if (existing.quantity >= maxStock) {
          toast.warning('Stock limit reached', `Only ${maxStock} ${unitName} in stock.`);
          return prev;
        }
        return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l));
      }
      if (maxStock <= 0) {
        toast.warning('Out of stock', `Not enough stock to sell a whole ${unitName}.`);
        return prev;
      }
      return [
        ...prev,
        {
          key,
          itemType: 'PRODUCT',
          refId: p.id,
          name: p.name,
          unitPrice,
          quantity: 1,
          perPage: false,
          discount: 0,
          sellUnit,
          baseUnit: p.baseUnit,
          bulkUnit: p.bulkUnit,
          unitSize: p.unitSize,
          basePrice,
          bulkPrice,
          stockBase: p.currentStock,
        },
      ];
    });
  };

  const addService = (s: Service) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.itemType === 'SERVICE' && l.refId === s.id);
      if (existing) {
        return prev.map((l) => (l.key === existing.key ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        {
          key: `S-${s.id}`,
          itemType: 'SERVICE',
          refId: s.id,
          name: s.name,
          unitPrice: num(s.unitPrice),
          quantity: 1,
          perPage: s.pricingType === 'PER_PAGE',
          pages: s.pricingType === 'PER_PAGE' ? 1 : undefined,
          discount: 0,
          sellUnit: 'BASE',
          baseUnit: 'job',
          bulkUnit: null,
          unitSize: 1,
          basePrice: num(s.unitPrice),
          bulkPrice: num(s.unitPrice),
        },
      ];
    });
  };

  const updateLine = (key: string, patch: Partial<CartLine>) =>
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  /**
   * Switch a product line between piece and bulk units: reprices, reclamps to
   * stock, and rekeys (product+unit). If a line for the target unit already
   * exists, merge into it so we never end up with duplicate same-unit lines.
   */
  const switchUnit = (key: string, sellUnit: SellUnit) =>
    setCart((prev) => {
      const line = prev.find((l) => l.key === key);
      if (!line || line.sellUnit === sellUnit) return prev;
      const newKey = `P-${line.refId}-${sellUnit}`;
      const { unitPrice, maxStock } = unitPricing(line, sellUnit);
      const cap = maxStock ?? Number.POSITIVE_INFINITY;
      const target = prev.find((l) => l.key === newKey);
      if (target) {
        const merged = Math.min(target.quantity + line.quantity, cap);
        return prev
          .filter((l) => l.key !== key)
          .map((l) => (l.key === newKey ? { ...l, quantity: merged } : l));
      }
      const quantity = Math.min(line.quantity, Math.max(1, cap));
      return prev.map((l) => (l.key === key ? { ...l, key: newKey, sellUnit, unitPrice, quantity } : l));
    });

  const removeLine = (key: string) => setCart((prev) => prev.filter((l) => l.key !== key));
  const clearCart = () => {
    setCart([]);
    setOrderDiscount('');
    setCashReceived('');
    setNotes('');
    setPayment('CASH');
    setCustomerId('');
  };

  const complete = async () => {
    if (cart.length === 0) return;
    if (payment === 'CASH' && received < total) {
      toast.error('Insufficient cash', 'Cash received is less than the total due.');
      return;
    }
    if (payment === 'CREDIT') {
      if (!customerId) {
        toast.error('Customer required', 'Select the customer who will owe this balance.');
        return;
      }
      if (received > total) {
        toast.error('Down payment too high', 'A credit down payment cannot exceed the total.');
        return;
      }
    }
    const items: SaleItemInput[] = cart.map((l) => ({
      itemType: l.itemType,
      productId: l.itemType === 'PRODUCT' ? l.refId : undefined,
      serviceId: l.itemType === 'SERVICE' ? l.refId : undefined,
      sellUnit: l.itemType === 'PRODUCT' ? l.sellUnit : undefined,
      quantity: l.quantity,
      pages: l.perPage ? l.pages || 1 : undefined,
      discount: l.discount || undefined,
    }));
    try {
      const sale = await createSale.mutateAsync({
        input: {
          items,
          paymentMethod: payment,
          customerId: payment === 'CREDIT' ? customerId : undefined,
          cashReceived: received,
          orderDiscount: orderDisc || undefined,
          notes: notes.trim() || undefined,
        },
        idempotencyKey: crypto.randomUUID(),
      });
      setReceipt(sale);
      clearCart();
    } catch (e) {
      toast.error('Sale failed', extractMessage(e));
    }
  };

  const list = tab === 'products' ? products : services;
  const completeDisabled =
    cart.length === 0 ||
    (payment === 'CASH' && received < total) ||
    (payment === 'CREDIT' && !customerId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-h1 font-bold text-primary">Point of Sale</h1>
          <p className="text-body-sm text-on-surface-variant">
            Ring up products and services, sell by piece or pack, and take cash or credit.
          </p>
        </div>
        {!session && (
          <Link
            to="/cash"
            className="flex items-center gap-2 rounded-xl border border-error/40 bg-error-container/40 px-4 py-2 text-body-sm font-semibold text-on-error-container"
          >
            <Icon name="warning" size={20} className="text-error" />
            No open cash session — open one to record sales
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 gap-gutter lg:grid-cols-12">
        {/* Catalog */}
        <div className="lg:col-span-7 xl:col-span-8">
          <Card className="flex h-full flex-col">
            <div className="flex flex-col gap-3 border-b border-outline-variant p-4 sm:flex-row sm:items-center">
              <SegmentedControl
                value={tab}
                onChange={(v) => {
                  setTab(v);
                  setSearch('');
                }}
                items={[
                  { value: 'products', label: 'Products' },
                  { value: 'services', label: 'Services' },
                ]}
              />
              <SearchInput value={search} onChange={setSearch} placeholder={`Search ${tab}…`} className="flex-1" />
              <div className="inline-flex shrink-0 rounded-lg border border-outline-variant bg-surface-container-low p-0.5">
                {(['grid', 'list'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    aria-label={`${v} view`}
                    title={`${v === 'grid' ? 'Grid' : 'List'} view`}
                    className={cn(
                      'rounded-md p-1.5 transition-all',
                      view === v
                        ? 'bg-surface-container-lowest text-on-surface shadow-sm'
                        : 'text-on-surface-variant hover:text-on-surface',
                    )}
                  >
                    <Icon name={v === 'grid' ? 'grid_view' : 'view_list'} size={18} />
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-[420px] p-4">
              {list.isLoading ? (
                <LoadingState />
              ) : tab === 'products' ? (
                products.data!.data.length === 0 ? (
                  <EmptyState icon="inventory_2" title="No products" description="No active products match your search." />
                ) : view === 'grid' ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                    {products.data!.data.map((p) => (
                      <ProductTile key={p.id} product={p} onAdd={() => addProduct(p)} />
                    ))}
                  </div>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {products.data!.data.map((p) => (
                      <ProductRow key={p.id} product={p} onAdd={() => addProduct(p)} />
                    ))}
                  </ul>
                )
              ) : services.data!.data.length === 0 ? (
                <EmptyState icon="print" title="No services" description="No active services match your search." />
              ) : view === 'grid' ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                  {services.data!.data.map((s) => (
                    <ServiceTile key={s.id} service={s} onAdd={() => addService(s)} />
                  ))}
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {services.data!.data.map((s) => (
                    <ServiceRow key={s.id} service={s} onAdd={() => addService(s)} />
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>

        {/* Cart */}
        <div className="lg:col-span-5 xl:col-span-4">
          <Card className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-outline-variant px-5 py-4">
              <h3 className="text-h3 font-semibold text-on-surface">Current Sale</h3>
              {cart.length > 0 && (
                <button onClick={clearCart} className="text-[13px] font-semibold text-error hover:underline">
                  Clear
                </button>
              )}
            </div>

            <div className="scrollbar-none flex-1 overflow-y-auto px-4 py-3" style={{ maxHeight: 320 }}>
              {cart.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center py-12 text-center text-on-surface-variant">
                  <Icon name="shopping_cart" size={40} />
                  <p className="mt-3 text-body-sm">Cart is empty. Tap an item to add it.</p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {cart.map((l) => {
                    const { maxStock } = unitPricing(l, l.sellUnit);
                    const hasBulk = l.itemType === 'PRODUCT' && !!l.bulkUnit && l.unitSize > 1;
                    return (
                      <li key={l.key} className="rounded-xl border border-outline-variant p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-body-sm font-semibold text-on-surface">{l.name}</p>
                            <p className="font-mono-data text-[11px] text-on-surface-variant">
                              {currency(l.unitPrice)} {l.perPage ? '/ page' : `/ ${unitWord(l)}`}
                            </p>
                          </div>
                          <button
                            onClick={() => removeLine(l.key)}
                            className="rounded-full p-1 text-on-surface-variant hover:bg-surface-container hover:text-error"
                          >
                            <Icon name="close" size={18} />
                          </button>
                        </div>

                        {hasBulk && (
                          <div className="mt-2">
                            <SegmentedControl
                              value={l.sellUnit}
                              onChange={(v) => switchUnit(l.key, v)}
                              items={[
                                { value: 'BASE', label: l.baseUnit },
                                { value: 'BULK', label: `${l.bulkUnit} ×${l.unitSize}` },
                              ]}
                            />
                          </div>
                        )}

                        <div className="mt-2 flex items-center gap-2">
                          <QtyStepper
                            value={l.quantity}
                            min={1}
                            max={maxStock}
                            onChange={(q) => updateLine(l.key, { quantity: q })}
                          />
                          {l.perPage && (
                            <label className="flex items-center gap-1 text-[11px] text-on-surface-variant">
                              <span>Pages</span>
                              <input
                                type="number"
                                min={1}
                                value={l.pages}
                                onChange={(e) => updateLine(l.key, { pages: Math.max(1, parseInt(e.target.value || '1', 10)) })}
                                className="h-8 w-14 rounded-lg border border-outline-variant bg-surface-container-lowest px-2 text-center text-[13px] outline-none focus:border-secondary"
                              />
                            </label>
                          )}
                          <div className="ml-auto font-mono-data text-body-sm font-bold text-on-surface">
                            {currency(lineTotal(l))}
                          </div>
                        </div>

                        <div className="mt-2 flex items-center gap-1">
                          <span className="text-[11px] text-on-surface-variant">Disc</span>
                          <input
                            type="number"
                            min={0}
                            value={l.discount || ''}
                            placeholder="0"
                            onChange={(e) => updateLine(l.key, { discount: Math.max(0, num(e.target.value)) })}
                            className="h-8 w-24 rounded-lg border border-outline-variant bg-surface-container-lowest px-2 text-[13px] outline-none focus:border-secondary"
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Summary */}
            <div className="space-y-3 border-t border-outline-variant p-4">
              <Row label="Subtotal" value={currency(subtotal)} />
              <div className="flex items-center justify-between">
                <span className="text-body-sm text-on-surface-variant">Order discount</span>
                <input
                  type="number"
                  min={0}
                  value={orderDiscount}
                  placeholder="0"
                  onChange={(e) => setOrderDiscount(e.target.value)}
                  className="h-9 w-28 rounded-lg border border-outline-variant bg-surface-container-lowest px-2 text-right font-mono-data text-body-sm outline-none focus:border-secondary"
                />
              </div>
              <div className="flex items-center justify-between border-t border-outline-variant pt-3">
                <span className="text-body-lg font-semibold text-on-surface">Total</span>
                <span className="font-mono-data text-h3 font-bold text-primary">{currency(total)}</span>
              </div>

              {/* Payment method */}
              <SegmentedControl
                value={payment}
                onChange={(v) => setPayment(v)}
                items={[
                  { value: 'CASH', label: 'Cash' },
                  { value: 'CREDIT', label: 'Credit' },
                ]}
              />

              {payment === 'CREDIT' && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-body-sm text-on-surface-variant">Customer (debtor)</span>
                    <button
                      type="button"
                      onClick={() => setCustModalOpen(true)}
                      className="text-[12px] font-semibold text-secondary hover:underline"
                    >
                      + Add new
                    </button>
                  </div>
                  <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                    <option value="">Select customer…</option>
                    {customers.data?.data.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.phone ? ` · ${c.phone}` : ''}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-body-sm text-on-surface-variant">
                  {payment === 'CREDIT' ? 'Paid now (down payment)' : 'Cash received'}
                </span>
                <input
                  type="number"
                  min={0}
                  value={cashReceived}
                  placeholder="0"
                  onChange={(e) => setCashReceived(e.target.value)}
                  className="h-10 w-32 rounded-lg border border-outline-variant bg-surface-container-lowest px-2 text-right font-mono-data text-body-lg font-semibold outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/30"
                />
              </div>
              {payment === 'CASH' && received > 0 && (
                <Row
                  label="Change"
                  value={currency(Math.max(0, change))}
                  valueClass={change < 0 ? 'text-error' : 'text-secondary'}
                />
              )}
              {payment === 'CREDIT' && (
                <Row label="Balance on credit" value={currency(creditBalance)} valueClass="text-error" />
              )}
              <Button
                size="lg"
                fullWidth
                icon="point_of_sale"
                disabled={completeDisabled}
                loading={createSale.isPending}
                onClick={complete}
              >
                {payment === 'CREDIT' ? 'Complete (on credit)' : 'Complete Sale'}
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <ReceiptModal sale={receipt} onClose={() => setReceipt(null)} />
      <UnitPickModal
        product={unitPick}
        onPick={(unit) => {
          if (unitPick) addProductUnit(unitPick, unit);
          setUnitPick(null);
        }}
        onClose={() => setUnitPick(null)}
      />
      <CustomerFormModal
        open={custModalOpen}
        onClose={() => setCustModalOpen(false)}
        customer={null}
        onCreated={(c) => setCustomerId(c.id)}
      />
    </div>
  );
}

/** Asks how a dual-unit product is being sold: by piece or by whole pack. */
function UnitPickModal({
  product,
  onPick,
  onClose,
}: {
  product: Product | null;
  onPick: (unit: SellUnit) => void;
  onClose: () => void;
}) {
  if (!product) return null;
  const basePrice = num(product.sellingPrice);
  const bulkPrice = product.bulkSellingPrice ? num(product.bulkSellingPrice) : basePrice * product.unitSize;
  const wholePacks = Math.floor(product.currentStock / product.unitSize);
  return (
    <Modal open={!!product} onClose={onClose} size="sm" title={product.name} subtitle="How is this being sold?">
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => onPick('BASE')}
          disabled={product.currentStock <= 0}
          className="flex flex-col items-center gap-1 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 transition-all hover:-translate-y-0.5 hover:border-secondary hover:shadow-md disabled:opacity-50"
        >
          <Icon name="looks_one" size={26} className="text-secondary" />
          <span className="text-body-sm font-semibold text-on-surface">By {product.baseUnit}</span>
          <span className="font-mono-data text-[13px] font-bold text-primary">{currency(basePrice)}</span>
          <span className="text-[11px] text-on-surface-variant">{product.currentStock} in stock</span>
        </button>
        <button
          onClick={() => onPick('BULK')}
          disabled={wholePacks <= 0}
          className="flex flex-col items-center gap-1 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 transition-all hover:-translate-y-0.5 hover:border-secondary hover:shadow-md disabled:opacity-50"
        >
          <Icon name="inventory_2" size={26} className="text-secondary" />
          <span className="text-body-sm font-semibold text-on-surface">
            By {product.bulkUnit} (×{product.unitSize})
          </span>
          <span className="font-mono-data text-[13px] font-bold text-primary">{currency(bulkPrice)}</span>
          <span className="text-[11px] text-on-surface-variant">{wholePacks} whole in stock</span>
        </button>
      </div>
    </Modal>
  );
}

/** Human label for the unit a line is transacted in. */
function unitWord(l: CartLine): string {
  if (l.perPage) return 'page';
  return l.sellUnit === 'BULK' && l.bulkUnit ? l.bulkUnit : l.baseUnit;
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-body-sm text-on-surface-variant">{label}</span>
      <span className={cn('font-mono-data text-body-sm font-semibold text-on-surface', valueClass)}>{value}</span>
    </div>
  );
}

function QtyStepper({
  value,
  onChange,
  min = 1,
  max,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex items-center rounded-lg border border-outline-variant">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        className="flex h-8 w-8 items-center justify-center text-on-surface-variant hover:bg-surface-container"
      >
        <Icon name="remove" size={16} />
      </button>
      <span className="w-8 text-center font-mono-data text-[13px] font-semibold">{value}</span>
      <button
        onClick={() => onChange(max ? Math.min(max, value + 1) : value + 1)}
        className="flex h-8 w-8 items-center justify-center text-on-surface-variant hover:bg-surface-container"
      >
        <Icon name="add" size={16} />
      </button>
    </div>
  );
}

function ProductTile({ product, onAdd }: { product: Product; onAdd: () => void }) {
  const low = product.currentStock <= product.minStockLevel;
  const out = product.currentStock <= 0;
  const src = imageSrc(product.imageUrl);
  const hasBulk = !!product.bulkUnit && product.unitSize > 1;
  return (
    <button
      onClick={onAdd}
      disabled={out}
      className={cn(
        'group flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest text-left transition-all hover:-translate-y-0.5 hover:border-secondary hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50',
      )}
    >
      <div className="flex h-20 items-center justify-center bg-surface-container-low">
        {src ? (
          <img src={src} alt={product.name} className="h-full w-full object-cover" />
        ) : (
          <Icon name="inventory_2" size={28} className="text-on-surface-variant" />
        )}
      </div>
      <div className="flex flex-1 flex-col p-2.5">
        <p className="line-clamp-2 text-[13px] font-semibold leading-tight text-on-surface">{product.name}</p>
        {hasBulk && (
          <p className="mt-0.5 text-[10px] text-on-surface-variant">
            {product.baseUnit} · {product.bulkUnit} ×{product.unitSize}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="font-mono-data text-[13px] font-bold text-primary">{currency(product.sellingPrice)}</span>
          <Badge tone={out ? 'error' : low ? 'warning' : 'neutral'}>{product.currentStock}</Badge>
        </div>
      </div>
    </button>
  );
}

function ProductRow({ product, onAdd }: { product: Product; onAdd: () => void }) {
  const low = product.currentStock <= product.minStockLevel;
  const out = product.currentStock <= 0;
  const src = imageSrc(product.imageUrl);
  const hasBulk = !!product.bulkUnit && product.unitSize > 1;
  return (
    <li>
      <button
        onClick={onAdd}
        disabled={out}
        className="flex w-full items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 text-left transition-all hover:border-secondary hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-container-low">
          {src ? (
            <img src={src} alt={product.name} className="h-full w-full object-cover" />
          ) : (
            <Icon name="inventory_2" size={22} className="text-on-surface-variant" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-on-surface">{product.name}</p>
          <p className="truncate text-[11px] text-on-surface-variant">
            {hasBulk ? `${product.baseUnit} · ${product.bulkUnit} ×${product.unitSize}` : product.baseUnit}
          </p>
        </div>
        <span className="shrink-0 font-mono-data text-[13px] font-bold text-primary">
          {currency(product.sellingPrice)}
        </span>
        <Badge tone={out ? 'error' : low ? 'warning' : 'neutral'}>{product.currentStock}</Badge>
      </button>
    </li>
  );
}

function ServiceRow({ service, onAdd }: { service: Service; onAdd: () => void }) {
  return (
    <li>
      <button
        onClick={onAdd}
        className="flex w-full items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 text-left transition-all hover:border-secondary hover:shadow-sm"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary-fixed text-on-primary-fixed">
          <Icon name={SERVICE_TYPE_ICON[service.type]} size={20} />
        </span>
        <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-on-surface">{service.name}</p>
        <span className="shrink-0 text-[11px] text-on-surface-variant">
          {service.pricingType === 'PER_PAGE' ? '/page' : 'fixed'}
        </span>
        <span className="shrink-0 font-mono-data text-[13px] font-bold text-primary">
          {currency(service.unitPrice)}
        </span>
      </button>
    </li>
  );
}

function ServiceTile({ service, onAdd }: { service: Service; onAdd: () => void }) {
  return (
    <button
      onClick={onAdd}
      className="group flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest p-3 text-left transition-all hover:-translate-y-0.5 hover:border-secondary hover:shadow-md"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-fixed text-on-primary-fixed">
        <Icon name={SERVICE_TYPE_ICON[service.type]} size={20} />
      </span>
      <p className="mt-2 line-clamp-2 text-[13px] font-semibold leading-tight text-on-surface">{service.name}</p>
      <div className="mt-auto flex items-center justify-between pt-2">
        <span className="font-mono-data text-[13px] font-bold text-primary">{currency(service.unitPrice)}</span>
        <span className="text-[10px] text-on-surface-variant">
          {service.pricingType === 'PER_PAGE' ? '/page' : 'fixed'}
        </span>
      </div>
    </button>
  );
}

function ReceiptModal({ sale, onClose }: { sale: Sale | null; onClose: () => void }) {
  if (!sale) return null;
  const credit = sale.paymentMethod === 'CREDIT';
  return (
    <Modal
      open={!!sale}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="outline" icon="print" onClick={() => window.print()}>
            Print
          </Button>
          <Button icon="add" onClick={onClose}>
            New Sale
          </Button>
        </>
      }
    >
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-secondary-container text-secondary">
          <Icon name="check_circle" size={30} filled />
        </div>
        <h3 className="text-h3 font-semibold text-on-surface">{credit ? 'Sale on Credit' : 'Sale Completed'}</h3>
        <p className="mt-1 font-mono-data text-body-sm text-on-surface-variant">{sale.invoiceNumber}</p>

        <div className="mt-5 space-y-2 rounded-xl bg-surface-container-low p-4 text-left">
          <Row label="Total" value={currency(sale.total)} />
          <Row label="Paid" value={currency(sale.amountPaid)} />
          {credit ? (
            <>
              {sale.customer?.name && <Row label="Customer" value={sale.customer.name} />}
              <Row label="Balance owed" value={currency(sale.amountDue)} valueClass="text-error" />
            </>
          ) : (
            <Row label="Change given" value={currency(sale.changeGiven)} valueClass="text-secondary" />
          )}
        </div>
      </div>
    </Modal>
  );
}
