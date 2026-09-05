import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  LoadingState,
  Combobox,
  ConfirmDialog,
  Modal,
  Popover,
  SearchInput,
  SegmentedControl,
} from '@/components/ui';
import { useToast } from '@/providers/ToastProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useActiveCashSession } from '@/providers/CashSessionProvider';
import { useProducts } from '@/hooks/useProducts';
import { useServices } from '@/hooks/useCatalog';
import { useCustomers } from '@/hooks/useCustomers';
import { useCreateSale, type SaleItemInput } from '@/hooks/useSales';
import { CustomerFormModal } from '@/features/customers/CustomerFormModal';
import { WastageModal } from '@/features/inventory/WastageModal';
import { DEFAULT_SERVICE_ICON } from '@/lib/constants';
import { extractMessage } from '@/lib/api';
import { cn, currency, imageSrc, num } from '@/lib/utils';
import type { PaymentMethod, Product, ProductVariant, Sale, SellUnit, Service, ServiceVariant } from '@/types';

/** Active, sellable options of a service. */
function activeServiceVariants(s: Service): ServiceVariant[] {
  return s.variants.filter((v) => v.status === 'ACTIVE');
}
function serviceVariantName(s: Service, v: ServiceVariant): string {
  return v.label && v.label !== 'Standard' ? `${s.name} — ${v.label}` : s.name;
}
function minServicePrice(s: Service): number {
  const vs = activeServiceVariants(s);
  return vs.length ? Math.min(...vs.map((v) => num(v.unitPrice))) : 0;
}

/**
 * Services are grouped in the POS by the part of their name before the first
 * separator (-, –, —). e.g. "Printing - Black & White" and "Printing - Color"
 * share the group "Printing"; the user picks the group, then the type inside.
 */
const SERVICE_NAME_SEP = /\s*[-–—]\s*/;
function serviceGroupKey(s: Service): string {
  return s.name.split(SERVICE_NAME_SEP)[0].trim() || s.name;
}
/** The part after the prefix, shown when choosing within a group. */
function serviceSubLabel(s: Service): string {
  const parts = s.name.split(SERVICE_NAME_SEP);
  return parts.length > 1 ? parts.slice(1).join(' - ').trim() : s.name;
}

interface ServiceGroup {
  key: string;
  icon: string;
  services: Service[];
}
/** Groups services by name prefix, preserving the incoming order. */
function groupServices(services: Service[]): ServiceGroup[] {
  const map = new Map<string, ServiceGroup>();
  for (const s of services) {
    const key = serviceGroupKey(s);
    const existing = map.get(key);
    if (existing) existing.services.push(s);
    else map.set(key, { key, icon: s.icon ?? DEFAULT_SERVICE_ICON, services: [s] });
  }
  return [...map.values()];
}

/** Active, sellable variants of a product. */
function activeVariants(p: Product): ProductVariant[] {
  return p.variants.filter((v) => v.status === 'ACTIVE');
}
function variantName(p: Product, v: ProductVariant): string {
  return v.label && v.label !== 'Default' ? `${p.name} — ${v.label}` : p.name;
}
function minSellingPrice(p: Product): number {
  const vs = activeVariants(p);
  return vs.length ? Math.min(...vs.map((v) => num(v.sellingPrice))) : 0;
}
function totalStock(p: Product): number {
  return activeVariants(p).reduce((a, v) => a + v.currentStock, 0);
}

/** How wide the variant picker should be, and how many columns it lays out.
 * Long lists (printing sizes, say) go wider rather than taller so every option
 * stays on screen instead of trailing off the bottom. */
function pickerLayout(count: number): { width: number; cols: string } {
  if (count <= 4) return { width: 300, cols: 'grid-cols-2' };
  if (count <= 9) return { width: 440, cols: 'grid-cols-3' };
  if (count <= 16) return { width: 588, cols: 'grid-cols-4' };
  return { width: 730, cols: 'grid-cols-5' };
}

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
  // products are sold by the piece; BULK = wholesale price tier
  sellUnit: SellUnit;
  baseUnit: string;
  retailPrice: number;
  wholesalePrice: number | null;
  stockBase?: number; // currentStock in base units (products)
}

function lineGross(l: CartLine): number {
  return l.perPage ? l.unitPrice * (l.pages || 1) * l.quantity : l.unitPrice * l.quantity;
}

function lineTotal(l: CartLine): number {
  return Math.max(0, lineGross(l) - l.discount);
}

/**
 * The in-progress sale, persisted to localStorage so navigating away and back
 * doesn't wipe the cart. Cleared once the sale is completed or the cart emptied.
 * The cash tendered is intentionally not persisted — it's entered at payment.
 *
 * The key is scoped per user so a shared device never carries one cashier's
 * cart into another's session.
 */
const POS_DRAFT_PREFIX = 'sp.posDraft';
const posDraftKey = (userId: string) => `${POS_DRAFT_PREFIX}:${userId}`;
interface PosDraft {
  cart?: CartLine[];
  orderDiscount?: string;
  payment?: PaymentMethod;
  customerId?: string;
  notes?: string;
}
function loadPosDraft(key: string): PosDraft {
  try {
    // Discard any pre-scoping draft so it can't leak between users.
    localStorage.removeItem(POS_DRAFT_PREFIX);
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && Array.isArray(parsed.cart) ? parsed : {};
  } catch {
    return {};
  }
}

export default function PosPage() {
  const toast = useToast();
  const { user } = useAuth();
  const { session } = useActiveCashSession();
  const createSale = useCreateSale();

  const draftKey = posDraftKey(user?.id ?? 'anon');
  const [draft] = useState(() => loadPosDraft(draftKey));
  const [tab, setTab] = useState<'products' | 'services'>('products');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>(draft.cart ?? []);
  const [orderDiscount, setOrderDiscount] = useState(draft.orderDiscount ?? '');
  const [payment, setPayment] = useState<PaymentMethod>(draft.payment ?? 'CASH');
  const [customerId, setCustomerId] = useState(draft.customerId ?? '');
  const [cashReceived, setCashReceived] = useState('');
  const [notes, setNotes] = useState(draft.notes ?? '');
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [variantPick, setVariantPick] = useState<{ product: Product; anchor: HTMLElement } | null>(null);
  const [serviceVariantPick, setServiceVariantPick] = useState<{ service: Service; anchor: HTMLElement } | null>(null);
  const [serviceCat, setServiceCat] = useState<string>('all');
  const [custModalOpen, setCustModalOpen] = useState(false);
  // The cart is a drawer so the catalog gets the whole page. It holds two
  // steps: adjust what is in the basket, then settle it. Payment sits behind a
  // deliberate step so a stray tap cannot complete a sale.
  const [cartOpen, setCartOpen] = useState(false);
  const [step, setStep] = useState<'cart' | 'pay'>('cart');
  // Non-null while the cashier is being asked to confirm an unusual sale.
  const [confirmWarnings, setConfirmWarnings] = useState<string[] | null>(null);
  const [wastageOpen, setWastageOpen] = useState(false);
  const [view, setView] = useState<'grid' | 'list'>(
    () => (localStorage.getItem('pos-view') === 'list' ? 'list' : 'grid'),
  );
  useEffect(() => {
    localStorage.setItem('pos-view', view);
  }, [view]);

  // The page behind the drawer should not scroll, and its scrollbar should not
  // sit alongside the panel. Removing it frees the width it occupied, so the
  // same width goes back as padding or the whole page jumps sideways as the
  // drawer opens.
  useEffect(() => {
    if (!cartOpen) return;
    const { body } = document;
    const gutter = window.innerWidth - document.documentElement.clientWidth;
    const overflow = body.style.overflow;
    const padding = body.style.paddingRight;
    body.style.overflow = 'hidden';
    if (gutter > 0) body.style.paddingRight = `${gutter}px`;
    return () => {
      body.style.overflow = overflow;
      body.style.paddingRight = padding;
    };
  }, [cartOpen]);

  // Esc closes the drawer, the way it closes every modal in the app. Ctrl+X
  // empties the basket from anywhere on the page, so a wrong order can be
  // abandoned without hunting for the drawer first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && cartOpen) {
        setCartOpen(false);
        return;
      }
      if ((e.key === 'x' || e.key === 'X') && (e.ctrlKey || e.metaKey)) {
        // Never steal Cut from a field the cashier is editing.
        const el = document.activeElement as HTMLElement | null;
        const typing =
          !!el &&
          (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
        if (typing || cart.length === 0) return;
        e.preventDefault();
        // Only setState setters inside, so the closure never goes stale.
        clearCart();
        toast.info('Cart cleared', 'Ctrl+X emptied the current sale.');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cartOpen, cart.length]);

  // Emptying the basket from the payment step would otherwise leave the cashier
  // settling nothing.
  useEffect(() => {
    if (cart.length === 0) setStep('cart');
  }, [cart.length]);

  // Keep the in-progress sale on disk so it survives navigation; an empty cart
  // clears the draft entirely.
  useEffect(() => {
    if (cart.length === 0) {
      localStorage.removeItem(draftKey);
      return;
    }
    localStorage.setItem(
      draftKey,
      JSON.stringify({ cart, orderDiscount, payment, customerId, notes }),
    );
  }, [cart, orderDiscount, payment, customerId, notes, draftKey]);

  const products = useProducts({ status: 'ACTIVE', limit: 50, search: tab === 'products' ? search || undefined : undefined });
  const services = useServices({ status: 'ACTIVE', limit: 50, search: tab === 'services' ? search || undefined : undefined });
  const customers = useCustomers({ limit: 100 });

  const serviceGroups = useMemo(() => groupServices(services.data?.data ?? []), [services.data]);
  // A category chip filters the flat list; "all" (or a stale key) shows everything.
  const activeGroup = serviceGroups.find((g) => g.key === serviceCat);
  const visibleServices = activeGroup ? activeGroup.services : services.data?.data ?? [];

  const subtotal = useMemo(() => cart.reduce((a, l) => a + lineTotal(l), 0), [cart]);
  const orderDisc = num(orderDiscount);
  const total = Math.max(0, subtotal - orderDisc);
  const received = num(cashReceived);
  const change = received - total;
  const creditBalance = Math.max(0, total - received);

  // Discounts measured against the undiscounted price of the cart, so a figure
  // typed into the wrong box shows up as the outsized reduction it is.
  const gross = useMemo(() => cart.reduce((a, l) => a + lineGross(l), 0), [cart]);
  const discountTotal = Math.max(0, gross - total);
  const discountPct = gross > 0 ? (discountTotal / gross) * 100 : 0;
  // A credit sale settled in full at the till leaves nothing owing — usually a
  // total typed into "Paid now" out of cash-sale habit.
  const creditFullySettled = payment === 'CREDIT' && total > 0 && received >= total;

  // Tapping a product: pick a variant when there's more than one; then dual-unit
  // items ask "pieces or pack?"; single-unit items add straight away.
  const addProduct = (p: Product, anchor: HTMLElement) => {
    const vs = activeVariants(p);
    if (vs.length === 0) {
      toast.warning('No variants', 'This product has no active variants to sell.');
      return;
    }
    if (vs.length > 1) {
      setVariantPick({ product: p, anchor });
      return;
    }
    pickVariant(p, vs[0]);
  };

  /** A variant chosen — add it directly (sold by the piece). */
  const pickVariant = (p: Product, v: ProductVariant) => {
    addVariantUnit(p, v);
  };

  /** Adds (or increments) a product variant line (sold by the piece). */
  const addVariantUnit = (p: Product, v: ProductVariant) => {
    const retailPrice = num(v.sellingPrice);
    const wholesalePrice = v.wholesalePrice && num(v.wholesalePrice) > 0 ? num(v.wholesalePrice) : null;
    const maxStock = v.currentStock;
    const key = `P-${v.id}`;

    setCart((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        if (existing.quantity >= maxStock) {
          toast.warning('Stock limit reached', `Only ${maxStock} ${p.baseUnit} in stock.`);
          return prev;
        }
        return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l));
      }
      if (maxStock <= 0) {
        toast.warning('Out of stock', `${variantName(p, v)} is out of stock.`);
        return prev;
      }
      return [
        ...prev,
        {
          key,
          itemType: 'PRODUCT',
          refId: v.id,
          name: variantName(p, v),
          unitPrice: retailPrice,
          quantity: 1,
          perPage: false,
          discount: 0,
          sellUnit: 'BASE',
          baseUnit: p.baseUnit,
          retailPrice,
          wholesalePrice,
          stockBase: v.currentStock,
        },
      ];
    });
  };

  // Tapping a service: pick an option (e.g. A4/A3) when there's more than one.
  const addService = (s: Service, anchor: HTMLElement) => {
    const vs = activeServiceVariants(s);
    if (vs.length === 0) {
      toast.warning('No options', 'This service has no active options to sell.');
      return;
    }
    if (vs.length > 1) {
      setServiceVariantPick({ service: s, anchor });
      return;
    }
    addServiceVariant(s, vs[0]);
  };

  const addServiceVariant = (s: Service, v: ServiceVariant) => {
    const price = num(v.unitPrice);
    const key = `S-${v.id}`;
    setCart((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        {
          key,
          itemType: 'SERVICE',
          refId: v.id,
          name: serviceVariantName(s, v),
          unitPrice: price,
          quantity: 1,
          perPage: s.pricingType === 'PER_PAGE',
          pages: s.pricingType === 'PER_PAGE' ? 1 : undefined,
          discount: 0,
          sellUnit: 'BASE',
          baseUnit: 'job',
          retailPrice: price,
          wholesalePrice: null,
          stockBase: undefined,
        },
      ];
    });
  };

  const updateLine = (key: string, patch: Partial<CartLine>) =>
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const removeLine = (key: string) => setCart((prev) => prev.filter((l) => l.key !== key));
  const clearCart = () => {
    setStep('cart');
    setCartOpen(false);
    setCart([]);
    setOrderDiscount('');
    setCashReceived('');
    setNotes('');
    setPayment('CASH');
    setCustomerId('');
  };

  const complete = async () => {
    if (cart.length === 0) return;
    if (!session) {
      toast.error('The till is closed', 'Open the shop’s cash session before recording sales.');
      return;
    }
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

    // Everything below is legal but rarely intended. Rather than block it, name
    // what the sale will actually record and make the cashier agree to it —
    // both traps here have quietly written off goods before.
    const warnings: string[] = [];
    if (total === 0 && gross > 0) {
      warnings.push(
        `The discount cancels this sale entirely: ${currency(gross)} of goods leave the shop, ` +
          `nothing is collected, and no debt is recorded against anyone.`,
      );
    } else if (discountPct >= 50) {
      warnings.push(
        `Discounts take ${Math.round(discountPct)}% off this sale — ${currency(discountTotal)} ` +
          `off ${currency(gross)}, leaving ${currency(total)} to pay.`,
      );
    }
    if (creditFullySettled) {
      warnings.push(
        `"Paid now" covers the full ${currency(total)}, so this credit sale records no balance owing. ` +
          `If the customer is taking it on credit, set "Paid now" back to 0; if they paid in full, ` +
          `switch the payment method to Cash.`,
      );
    }
    if (warnings.length > 0) {
      setConfirmWarnings(warnings);
      return;
    }

    await submitSale();
  };

  const submitSale = async () => {
    const items: SaleItemInput[] = cart.map((l) => ({
      itemType: l.itemType,
      variantId: l.itemType === 'PRODUCT' ? l.refId : undefined,
      serviceVariantId: l.itemType === 'SERVICE' ? l.refId : undefined,
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
      setConfirmWarnings(null);
      clearCart();
    } catch (e) {
      // Leave any confirmation open so the cashier can retry without re-reading
      // the warnings into an empty dialog.
      toast.error('Sale failed', extractMessage(e));
    }
  };

  const list = tab === 'products' ? products : services;
  const completeDisabled =
    cart.length === 0 ||
    !session ||
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
        <div className="flex items-center gap-3">
          {!session && (
            <Link
              to="/cash"
              className="flex items-center gap-2 rounded-xl border border-error/40 bg-error-container/40 px-4 py-2 text-body-sm font-semibold text-on-error-container"
            >
              <Icon name="warning" size={20} className="text-error" />
              The till is closed. Open it to record sales
            </Link>
          )}
          {/* Jams happen here, mid-job. Making the cashier leave for the
              inventory screen is how spoiled paper goes unrecorded. */}
          <Button variant="outline" icon="delete_sweep" onClick={() => setWastageOpen(true)}>
            Record wastage
          </Button>
        </div>
      </div>

      {/* The catalog takes the whole page; the basket lives in the drawer. */}
      <div>
        <Card className="flex flex-col">
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
                    <ProductTile key={p.id} product={p} onAdd={(a) => addProduct(p, a)} />
                  ))}
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {products.data!.data.map((p) => (
                    <ProductRow key={p.id} product={p} onAdd={(a) => addProduct(p, a)} />
                  ))}
                </ul>
              )
            ) : services.data!.data.length === 0 ? (
              <EmptyState icon="print" title="No services" description="No active services match your search." />
            ) : (
              <>
                {serviceGroups.length > 1 && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    <ServiceChip label="All" active={!activeGroup} onClick={() => setServiceCat('all')} />
                    {serviceGroups.map((g) => (
                      <ServiceChip
                        key={g.key}
                        icon={g.icon}
                        label={g.key}
                        active={activeGroup?.key === g.key}
                        onClick={() => setServiceCat(g.key)}
                      />
                    ))}
                  </div>
                )}
                {view === 'grid' ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                    {visibleServices.map((s) => (
                      <ServiceTile
                        key={s.id}
                        service={s}
                        label={activeGroup ? serviceSubLabel(s) : s.name}
                        onAdd={(a) => addService(s, a)}
                      />
                    ))}
                  </div>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {visibleServices.map((s) => (
                      <ServiceRow
                        key={s.id}
                        service={s}
                        label={activeGroup ? serviceSubLabel(s) : s.name}
                        onAdd={(a) => addService(s, a)}
                      />
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </Card>

        {/* The way back into the sale. Always on screen, so the basket is never
            more than one tap away however far the catalog has been scrolled. */}
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className={cn(
            'fixed bottom-6 right-6 z-30 flex items-center gap-3 rounded-2xl bg-primary py-3 pl-4 pr-5 text-on-primary shadow-lg transition-all duration-300 hover:shadow-xl',
            cartOpen ? 'pointer-events-none translate-y-4 opacity-0' : 'translate-y-0 opacity-100',
          )}
        >
          <span className="relative">
            <Icon name="shopping_cart" size={24} />
            {cart.length > 0 && (
              <span className="absolute -right-2 -top-2 grid h-5 min-w-[20px] place-items-center rounded-full bg-error px-1 text-[11px] font-bold text-on-error">
                {cart.length}
              </span>
            )}
          </span>
          <span className="flex flex-col items-start leading-tight">
            <span className="text-[11px] font-medium opacity-80">
              {cart.length === 0 ? 'Cart is empty' : 'Current sale'}
            </span>
            <span className="font-mono-data text-body-lg font-bold">{currency(total)}</span>
          </span>
        </button>

        {/* The basket, as a drawer over the catalog: what is being sold, then
            how it is paid for. */}
        <div
          className={cn(
            'fixed inset-0 z-40 bg-on-background/40 backdrop-blur-sm transition-opacity duration-300',
            cartOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
          onClick={() => setCartOpen(false)}
          aria-hidden
        />
        <aside
          aria-label="Current sale"
          className={cn(
            'fixed right-0 top-0 z-50 flex h-screen w-full max-w-[420px] flex-col border-l border-outline-variant bg-surface-container-lowest shadow-2xl transition-transform duration-300 ease-out',
            cartOpen ? 'translate-x-0' : 'translate-x-full',
          )}
        >
          <div className="flex items-center justify-between border-b border-outline-variant px-5 py-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCartOpen(false)}
                aria-label="Close the sale"
                className="rounded-full p-1 text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
              >
                <Icon name="close" size={20} />
              </button>
              <h3 className="text-h3 font-semibold text-on-surface">Current Sale</h3>
            </div>
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                title="Clear the sale (Ctrl+X)"
                className="text-[13px] font-semibold text-error hover:underline"
              >
                Clear
              </button>
            )}
          </div>

          {/* Where the cashier is, and the way back. */}
          <ol className="flex items-center gap-2 border-b border-outline-variant px-5 py-3">
            <StepChip
              n={1}
              label="Items"
              active={step === 'cart'}
              done={step === 'pay'}
              onClick={() => setStep('cart')}
            />
            <li className="h-px flex-1 bg-outline-variant" aria-hidden />
            <StepChip n={2} label="Payment" active={step === 'pay'} />
          </ol>

          {step === 'cart' ? (
            <>
              <div className="scrollbar-none flex-1 overflow-y-auto px-4 py-3">
                {cart.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center py-12 text-center text-on-surface-variant">
                    <Icon name="shopping_cart" size={40} />
                    <p className="mt-3 text-body-sm">Cart is empty. Tap an item to add it.</p>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {cart.map((l) => {
                      const maxStock = l.stockBase;
                      const color = lineColor(l.refId);
                      return (
                        <li
                          key={l.key}
                          className="rounded-xl border border-l-4 border-outline-variant p-3"
                          style={{ borderLeftColor: color }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex min-w-0 items-start gap-2">
                              <span
                                className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: color }}
                              />
                              <div className="min-w-0">
                                <p className="truncate text-body-sm font-semibold text-on-surface">{l.name}</p>
                                <p className="font-mono-data text-[11px] text-on-surface-variant">
                                  {currency(l.unitPrice)} {l.perPage ? '/ page' : `/ ${unitWord(l)}`}
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={() => removeLine(l.key)}
                              className="rounded-full p-1 text-on-surface-variant hover:bg-surface-container hover:text-error"
                            >
                              <Icon name="close" size={18} />
                            </button>
                          </div>

                          {l.wholesalePrice != null && (
                            <div className="mt-2">
                              <SegmentedControl
                                value={l.sellUnit}
                                onChange={(v) =>
                                  updateLine(l.key, {
                                    sellUnit: v,
                                    unitPrice: v === 'BULK' ? l.wholesalePrice! : l.retailPrice,
                                  })
                                }
                                items={[
                                  { value: 'BASE', label: `Retail ${currency(l.retailPrice)}` },
                                  { value: 'BULK', label: `Wholesale ${currency(l.wholesalePrice)}` },
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

              {/* Step one only decides what is being sold; the money is step
                  two's business, so the running total rides on the button. */}
              <div className="border-t border-outline-variant p-4">
                <Button
                  size="lg"
                  fullWidth
                  icon="arrow_forward"
                  disabled={cart.length === 0 || !session}
                  onClick={() => setStep('pay')}
                >
                  Continue to payment · {currency(total)}
                </Button>
              </div>
            </>
          ) : (
            <div className="scrollbar-none flex-1 space-y-3 overflow-y-auto p-4">
              {/* What is owed, worked out in front of the cashier, immediately
                  above how it will be settled. */}
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
              {gross > 0 && total === 0 ? (
                <PanelWarning>
                  The discount cancels the whole sale: {currency(gross)} of goods for nothing, and
                  no debt recorded. Did you mean to type that into “Paid now” instead?
                </PanelWarning>
              ) : (
                discountPct >= 50 && (
                  <PanelWarning>
                    {Math.round(discountPct)}% off, {currency(discountTotal)} discounted from{' '}
                    {currency(gross)}.
                  </PanelWarning>
                )
              )}

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
                  <Combobox
                    value={customerId}
                    onChange={setCustomerId}
                    options={[
                      { value: '', label: 'Select customer…' },
                      ...(customers.data?.data ?? []).map((c) => ({
                        value: c.id,
                        label: c.phone ? `${c.name} · ${c.phone}` : c.name,
                      })),
                    ]}
                    placeholder="Search a customer…"
                  />
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
                <>
                  <Row
                    label="Balance on credit"
                    value={currency(creditBalance)}
                    valueClass={creditBalance > 0 ? 'text-error' : 'text-on-surface-variant'}
                  />
                  {creditFullySettled && (
                    <PanelWarning>
                      Nothing will be owed. “Paid now” already covers the whole sale. Clear it to
                      put {currency(total)} on the customer’s account, or switch to Cash.
                    </PanelWarning>
                  )}
                </>
              )}
              {/* A grid, not a flex row: Button carries `shrink-0`, so a
                  `fullWidth` Complete beside Back adds up to more than the
                  panel and spills past its padding. Tracks size it instead. */}
              <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 pt-1">
                <Button size="lg" variant="outline" icon="arrow_back" onClick={() => setStep('cart')}>
                  Back
                </Button>
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
            </div>
          )}
        </aside>
      </div>

      <ReceiptModal sale={receipt} onClose={() => setReceipt(null)} />

      <Popover
        anchor={variantPick?.anchor ?? null}
        open={!!variantPick}
        onClose={() => setVariantPick(null)}
        width={pickerLayout(variantPick ? activeVariants(variantPick.product).length : 0).width}
      >
        {variantPick && (
          <>
            <p className="sticky top-0 z-10 bg-surface-container-high px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
              {variantPick.product.name} · pick a variant
            </p>
            <div className={cn('grid gap-2', pickerLayout(activeVariants(variantPick.product).length).cols)}>
              {activeVariants(variantPick.product).map((v) => {
                const out = v.currentStock <= 0;
                return (
                  <button
                    key={v.id}
                    disabled={out}
                    onClick={() => {
                      const p = variantPick.product;
                      setVariantPick(null);
                      pickVariant(p, v);
                    }}
                    className="flex flex-col items-center gap-0.5 rounded-lg border border-outline-variant bg-surface-container-lowest p-2.5 transition-all hover:-translate-y-0.5 hover:border-secondary hover:shadow-sm disabled:opacity-50"
                  >
                    <span className="text-body-sm font-semibold text-on-surface">{v.label}</span>
                    <span className="font-mono-data text-[13px] font-bold text-primary">{currency(v.sellingPrice)}</span>
                    <span className={cn('text-[11px]', out ? 'text-error' : 'text-on-surface-variant')}>
                      {v.currentStock} in stock
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </Popover>

      <Popover
        anchor={serviceVariantPick?.anchor ?? null}
        open={!!serviceVariantPick}
        onClose={() => setServiceVariantPick(null)}
        width={pickerLayout(serviceVariantPick ? activeServiceVariants(serviceVariantPick.service).length : 0).width}
      >
        {serviceVariantPick && (
          <>
            <p className="sticky top-0 z-10 bg-surface-container-high px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
              {serviceVariantPick.service.name} · pick an option
            </p>
            <div className={cn('grid gap-2', pickerLayout(activeServiceVariants(serviceVariantPick.service).length).cols)}>
              {activeServiceVariants(serviceVariantPick.service).map((v) => (
                <button
                  key={v.id}
                  onClick={() => {
                    const s = serviceVariantPick.service;
                    setServiceVariantPick(null);
                    addServiceVariant(s, v);
                  }}
                  className="flex flex-col items-center gap-0.5 rounded-lg border border-outline-variant bg-surface-container-lowest p-2.5 transition-all hover:-translate-y-0.5 hover:border-secondary hover:shadow-sm"
                >
                  <Icon name="description" size={22} className="text-secondary" />
                  <span className="text-body-sm font-semibold text-on-surface">{v.label}</span>
                  <span className="font-mono-data text-[13px] font-bold text-primary">{currency(v.unitPrice)}</span>
                  <span className="text-[11px] text-on-surface-variant">
                    {serviceVariantPick.service.pricingType === 'PER_PAGE' ? 'per page' : 'fixed'}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </Popover>
      <WastageModal open={wastageOpen} onClose={() => setWastageOpen(false)} />
      <CustomerFormModal
        open={custModalOpen}
        onClose={() => setCustModalOpen(false)}
        customer={null}
        onCreated={(c) => setCustomerId(c.id)}
      />
      <ConfirmDialog
        open={confirmWarnings !== null}
        onClose={() => setConfirmWarnings(null)}
        onConfirm={submitSale}
        loading={createSale.isPending}
        icon="report"
        title="Check this sale before recording it"
        confirmLabel="Record it anyway"
        cancelLabel="Go back"
        message={
          <span className="flex flex-col gap-2 text-left">
            {(confirmWarnings ?? []).map((w, i) => (
              <span key={i}>{w}</span>
            ))}
          </span>
        }
      />
    </div>
  );
}

/** Asks which variant of a multi-variant product is being sold. */
/** Human label for the unit a line is transacted in. */
function unitWord(l: CartLine): string {
  return l.perPage ? 'page' : l.baseUnit;
}

/** A fixed palette of distinct accent colours for cart lines. */
const LINE_COLORS = [
  '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
];

/** Stable colour for a cart line, derived from its item id so the same product
 * always gets the same colour (helps tell similar items apart at a glance). */
function lineColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return LINE_COLORS[h % LINE_COLORS.length];
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-body-sm text-on-surface-variant">{label}</span>
      <span className={cn('font-mono-data text-body-sm font-semibold text-on-surface', valueClass)}>{value}</span>
    </div>
  );
}

/** One of the drawer's two steps. Step 1 stays clickable from step 2 so a line
 *  can be fixed without abandoning the sale. */
function StepChip({
  n,
  label,
  active,
  done,
  onClick,
}: {
  n: number;
  label: string;
  active: boolean;
  done?: boolean;
  onClick?: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className={cn(
          'flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-body-sm font-semibold transition-colors',
          active ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant',
          onClick && !active && 'hover:bg-surface-container hover:text-on-surface',
        )}
      >
        <span
          className={cn(
            'grid h-6 w-6 place-items-center rounded-full text-[12px]',
            active
              ? 'bg-primary text-on-primary'
              : done
                ? 'bg-secondary text-on-secondary'
                : 'bg-surface-container text-on-surface-variant',
          )}
        >
          {done ? <Icon name="check" size={14} /> : n}
        </span>
        {label}
      </button>
    </li>
  );
}

/** An amber note in the payment panel: the sale is legal, but read it again. */
function PanelWarning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-tertiary/40 bg-tertiary-container/40 p-2.5">
      <Icon name="warning" size={18} className="mt-px shrink-0 text-tertiary" />
      <span className="text-[12px] leading-snug text-on-surface">{children}</span>
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
  const clamp = (n: number) => {
    let c = Math.max(min, n);
    if (max != null) c = Math.min(max, c);
    return c;
  };
  // Local text so the field can be cleared/retyped (e.g. type "500" directly).
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  return (
    <div className="flex items-center rounded-lg border border-outline-variant">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        className="flex h-8 w-8 items-center justify-center text-on-surface-variant hover:bg-surface-container"
      >
        <Icon name="remove" size={16} />
      </button>
      <input
        value={text}
        inputMode="numeric"
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9]/g, '');
          setText(raw);
          const n = parseInt(raw, 10);
          if (!Number.isNaN(n)) onChange(clamp(n));
        }}
        onBlur={() => {
          const n = parseInt(text, 10);
          const next = Number.isNaN(n) ? value : clamp(n);
          setText(String(next));
          if (!Number.isNaN(n)) onChange(next);
        }}
        className="w-8 bg-transparent text-center font-mono-data text-[13px] font-semibold text-on-surface outline-none"
      />
      <button
        onClick={() => onChange(max ? Math.min(max, value + 1) : value + 1)}
        className="flex h-8 w-8 items-center justify-center text-on-surface-variant hover:bg-surface-container"
      >
        <Icon name="add" size={16} />
      </button>
    </div>
  );
}

function ProductTile({ product, onAdd }: { product: Product; onAdd: (anchor: HTMLElement) => void }) {
  const stock = totalStock(product);
  const out = stock <= 0;
  const src = imageSrc(product.imageUrl);
  const multi = activeVariants(product).length > 1;
  const price = minSellingPrice(product);
  return (
    <button
      onClick={(e) => onAdd(e.currentTarget)}
      disabled={out}
      className={cn(
        'group flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest text-left transition-all hover:-translate-y-0.5 hover:border-secondary hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50',
      )}
    >
      <div className="relative flex h-20 items-center justify-center bg-surface-container-low">
        {src ? (
          <img src={src} alt={product.name} className="h-full w-full object-cover" />
        ) : (
          <Icon name="inventory_2" size={28} className="text-on-surface-variant" />
        )}
        {multi && (
          <span className="absolute right-1.5 top-1.5 rounded-full bg-surface/85 px-1.5 py-0.5 text-[10px] font-semibold text-on-surface-variant ring-1 ring-outline-variant backdrop-blur-sm">
            {activeVariants(product).length} variants
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-2.5">
        <p className="line-clamp-2 text-[13px] font-semibold leading-tight text-on-surface">{product.name}</p>
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="font-mono-data text-[13px] font-bold text-primary">
            {multi ? `from ${currency(price)}` : currency(price)}
          </span>
          <Badge tone={out ? 'error' : 'neutral'}>{stock}</Badge>
        </div>
      </div>
    </button>
  );
}

function ProductRow({ product, onAdd }: { product: Product; onAdd: (anchor: HTMLElement) => void }) {
  const stock = totalStock(product);
  const out = stock <= 0;
  const src = imageSrc(product.imageUrl);
  const multi = activeVariants(product).length > 1;
  const price = minSellingPrice(product);
  return (
    <li>
      <button
        onClick={(e) => onAdd(e.currentTarget)}
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
            {multi ? `${activeVariants(product).length} variants` : product.baseUnit}
          </p>
        </div>
        <span className="shrink-0 font-mono-data text-[13px] font-bold text-primary">
          {multi ? `from ${currency(price)}` : currency(price)}
        </span>
        <Badge tone={out ? 'error' : 'neutral'}>{stock}</Badge>
      </button>
    </li>
  );
}

/** A category filter chip above the service list (e.g. All / Printing / Photocopy). */
function ServiceChip({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors',
        active
          ? 'border-primary bg-primary-fixed text-on-primary-fixed'
          : 'border-outline-variant text-on-surface-variant hover:border-secondary hover:text-on-surface',
      )}
    >
      {icon && <Icon name={icon} size={16} />}
      {label}
    </button>
  );
}

function ServiceRow({ service, label, onAdd }: { service: Service; label: string; onAdd: (anchor: HTMLElement) => void }) {
  const multi = activeServiceVariants(service).length > 1;
  const price = minServicePrice(service);
  return (
    <li>
      <button
        onClick={(e) => onAdd(e.currentTarget)}
        className="flex w-full items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 text-left transition-all hover:border-secondary hover:shadow-sm"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary-fixed text-on-primary-fixed">
          <Icon name={service.icon ?? DEFAULT_SERVICE_ICON} size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-on-surface">{label}</p>
          {multi && (
            <p className="truncate text-[11px] text-on-surface-variant">
              {activeServiceVariants(service).length} options
            </p>
          )}
        </div>
        <span className="shrink-0 text-[11px] text-on-surface-variant">
          {service.pricingType === 'PER_PAGE' ? '/page' : 'fixed'}
        </span>
        <span className="shrink-0 font-mono-data text-[13px] font-bold text-primary">
          {multi ? `from ${currency(price)}` : currency(price)}
        </span>
      </button>
    </li>
  );
}

function ServiceTile({ service, label, onAdd }: { service: Service; label: string; onAdd: (anchor: HTMLElement) => void }) {
  const multi = activeServiceVariants(service).length > 1;
  const price = minServicePrice(service);
  return (
    <button
      onClick={(e) => onAdd(e.currentTarget)}
      className="group flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest p-3 text-left transition-all hover:-translate-y-0.5 hover:border-secondary hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-fixed text-on-primary-fixed">
          <Icon name={service.icon ?? DEFAULT_SERVICE_ICON} size={20} />
        </span>
        {multi && (
          <span className="rounded-full bg-surface-container-high px-1.5 py-0.5 text-[10px] font-semibold text-on-surface-variant">
            {activeServiceVariants(service).length} options
          </span>
        )}
      </div>
      <p className="mt-2 line-clamp-2 text-[13px] font-semibold leading-tight text-on-surface">{label}</p>
      <div className="mt-auto flex items-center justify-between pt-2">
        <span className="font-mono-data text-[13px] font-bold text-primary">
          {multi ? `from ${currency(price)}` : currency(price)}
        </span>
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
