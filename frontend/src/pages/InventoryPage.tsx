import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Combobox,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Pagination,
  Select,
  StatCard,
  Tabs,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  Textarea,
} from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { useAdjustStock, useMovements } from '@/hooks/useInventory';
import { useStockLevels } from '@/hooks/useReports';
import { useProducts, useLowStockProducts } from '@/hooks/useProducts';
import { extractMessage } from '@/lib/api';
import { cn, currency, formatDateTime, humanize, num } from '@/lib/utils';
import type { InventoryMovementType } from '@/types';

type TabKey = 'movements' | 'low' | 'valuation';

const MOVE_TONE: Record<InventoryMovementType, 'success' | 'error' | 'info' | 'warning'> = {
  PURCHASE: 'success',
  SALE: 'info',
  ADJUSTMENT: 'warning',
  RETURN: 'success',
};

export default function InventoryPage() {
  const { can } = useAuth();
  const canManage = can('inventory');
  const [tab, setTab] = useState<TabKey>('movements');
  const [adjustOpen, setAdjustOpen] = useState(false);

  const lowStock = useLowStockProducts();
  const valuation = useStockLevels();

  const totalValuation = (valuation.data ?? []).reduce((a, r) => a + num(r.valuation), 0);
  const totalUnits = (valuation.data ?? []).reduce((a, r) => a + r.currentStock, 0);

  return (
    <div className="flex flex-col gap-gutter">
      <PageHeader
        title="Inventory"
        description="Track stock movements, monitor low stock, and reconcile counts."
        actions={
          canManage && (
            <Button icon="tune" onClick={() => setAdjustOpen(true)}>
              Adjust Stock
            </Button>
          )
        }
      />

      <div className="grid grid-cols-1 gap-gutter sm:grid-cols-3">
        <StatCard
          label="Stock Valuation"
          icon="paid"
          accent="secondary"
          loading={valuation.isLoading}
          value={currency(totalValuation)}
          hint="FIFO batch cost"
        />
        <StatCard
          label="Total Units"
          icon="inventory_2"
          accent="primary"
          loading={valuation.isLoading}
          value={num(totalUnits).toLocaleString()}
          hint={`${valuation.data?.length ?? 0} SKUs`}
        />
        <StatCard
          label="Low Stock Items"
          icon="warning"
          accent="error"
          loading={lowStock.isLoading}
          value={lowStock.data?.length ?? 0}
          hint="At or below minimum"
        />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'movements', label: 'Stock Movements', icon: 'swap_vert' },
          { value: 'low', label: 'Low Stock', icon: 'warning', count: lowStock.data?.length },
          { value: 'valuation', label: 'Valuation', icon: 'paid' },
        ]}
      />

      {tab === 'movements' && <MovementsTab />}
      {tab === 'low' && <LowStockTab />}
      {tab === 'valuation' && <ValuationTab />}

      <AdjustStockModal open={adjustOpen} onClose={() => setAdjustOpen(false)} />
    </div>
  );
}

function MovementsTab() {
  const [page, setPage] = useState(1);
  const [type, setType] = useState<InventoryMovementType | ''>('');
  const [productId, setProductId] = useState('');
  const { data: products } = useProducts({ limit: 100 });
  const { data, isLoading, isError, refetch, error } = useMovements({
    page,
    limit: 15,
    type: type || undefined,
    productId: productId || undefined,
  });

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-outline-variant p-4 sm:flex-row">
        <Select value={productId} onChange={(e) => { setProductId(e.target.value); setPage(1); }} className="sm:w-64">
          <option value="">All products</option>
          {products?.data.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
        <Select value={type} onChange={(e) => { setType(e.target.value as InventoryMovementType | ''); setPage(1); }} className="sm:w-48">
          <option value="">All movement types</option>
          <option value="PURCHASE">Purchase</option>
          <option value="SALE">Sale</option>
          <option value="ADJUSTMENT">Adjustment</option>
          <option value="RETURN">Return</option>
        </Select>
      </div>

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message={extractMessage(error)} onRetry={refetch} />
      ) : data!.data.length === 0 ? (
        <EmptyState icon="swap_vert" title="No movements" description="Stock movements appear as you buy and sell." />
      ) : (
        <>
          <Table>
            <THead>
              <TH>Date</TH>
              <TH>Product</TH>
              <TH align="center">Type</TH>
              <TH align="right">Change</TH>
              <TH align="center">Before → After</TH>
              <TH>By</TH>
            </THead>
            <TBody>
              {data!.data.map((m) => (
                <TR key={m.id}>
                  <TD className="whitespace-nowrap text-on-surface-variant">{formatDateTime(m.createdAt)}</TD>
                  <TD className="font-medium">
                    {m.product?.name ?? '—'}
                    {m.variant && m.variant.label !== 'Default' && (
                      <span className="text-on-surface-variant"> — {m.variant.label}</span>
                    )}
                  </TD>
                  <TD align="center"><Badge tone={MOVE_TONE[m.type]}>{humanize(m.type)}</Badge></TD>
                  <TD align="right">
                    <span className={cn('font-mono-data font-bold', m.quantity >= 0 ? 'text-secondary' : 'text-error')}>
                      {m.quantity >= 0 ? '+' : ''}{m.quantity}
                    </span>
                  </TD>
                  <TD align="center" className="font-mono-data text-on-surface-variant">
                    {m.beforeQty} → <span className="font-semibold text-on-surface">{m.afterQty}</span>
                  </TD>
                  <TD className="text-on-surface-variant">{m.user?.fullName ?? 'System'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Pagination meta={data!.meta} onPage={setPage} />
        </>
      )}
    </Card>
  );
}

function LowStockTab() {
  const { data, isLoading, isError, refetch, error } = useLowStockProducts();
  return (
    <Card>
      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message={extractMessage(error)} onRetry={refetch} />
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState icon="check_circle" title="Stock levels healthy" description="No products are below their minimum stock level." />
      ) : (
        <Table>
          <THead>
            <TH>Product</TH>
            <TH>SKU</TH>
            <TH align="center">Current</TH>
            <TH align="center">Minimum</TH>
            <TH align="center">Shortfall</TH>
          </THead>
          <TBody>
            {data!.map((p) => (
              <TR key={p.sku}>
                <TD className="font-medium">{p.name}</TD>
                <TD className="font-mono-data text-on-surface-variant">{p.sku}</TD>
                <TD align="center"><span className="font-mono-data font-bold text-error">{p.currentStock}</span></TD>
                <TD align="center" className="font-mono-data">{p.minStockLevel}</TD>
                <TD align="center">
                  <Badge tone="error">{Math.max(0, p.minStockLevel - p.currentStock)} short</Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}

function ValuationTab() {
  const { data, isLoading, isError, refetch, error } = useStockLevels();
  return (
    <Card>
      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message={extractMessage(error)} onRetry={refetch} />
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState icon="paid" title="No inventory" description="Valuation appears once you have stock on hand." />
      ) : (
        <Table>
          <THead>
            <TH>Product</TH>
            <TH>SKU</TH>
            <TH align="center">Stock</TH>
            <TH align="center">Min</TH>
            <TH align="right">Valuation</TH>
          </THead>
          <TBody>
            {data!.map((r) => (
              <TR key={r.sku}>
                <TD className="font-medium">{r.name}</TD>
                <TD className="font-mono-data text-on-surface-variant">{r.sku}</TD>
                <TD align="center" className="font-mono-data">{r.currentStock}</TD>
                <TD align="center" className="font-mono-data text-on-surface-variant">{r.minStockLevel}</TD>
                <TD align="right" className="font-mono-data font-semibold">{currency(r.valuation)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}

function AdjustStockModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const adjust = useAdjustStock();
  const { data: products } = useProducts({ status: 'ACTIVE', limit: 100 });

  // One option per active variant.
  const variantOptions = (products?.data ?? []).flatMap((p) =>
    p.variants
      .filter((v) => v.status === 'ACTIVE')
      .map((v) => ({
        variantId: v.id,
        currentStock: v.currentStock,
        buyingPrice: num(v.buyingPrice),
        label:
          v.label && v.label !== 'Default' ? `${p.name} — ${v.label}` : p.name,
      })),
  );

  const [variantId, setVariantId] = useState('');
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [unitCost, setUnitCost] = useState('');

  useEffect(() => {
    if (open) {
      setVariantId('');
      setDirection('in');
      setQuantity('');
      setReason('');
      setUnitCost('');
    }
  }, [open]);

  const submit = async () => {
    if (!variantId) return toast.error('Select a product variant');
    const qty = parseInt(quantity, 10);
    if (!qty || qty <= 0) return toast.error('Enter a quantity greater than zero');
    if (!reason.trim()) return toast.error('A reason is required');
    const quantityChange = direction === 'in' ? qty : -qty;
    try {
      await adjust.mutateAsync({
        variantId,
        quantityChange,
        reason: reason.trim(),
        unitCost: direction === 'in' && unitCost ? num(unitCost) : undefined,
      });
      toast.success('Stock adjusted', `${direction === 'in' ? '+' : '-'}${qty} units recorded.`);
      onClose();
    } catch (e) {
      toast.error('Adjustment failed', extractMessage(e));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Adjust Stock"
      subtitle="Record a manual correction (damaged goods, recounts, etc.)"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={adjust.isPending}>Cancel</Button>
          <Button onClick={submit} loading={adjust.isPending} icon="check">Apply Adjustment</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Product / variant" required>
          <Combobox
            value={variantId}
            onChange={(id) => {
              setVariantId(id);
              // Prefill the unit cost with the variant's reference buying price.
              const opt = variantOptions.find((o) => o.variantId === id);
              setUnitCost(opt && opt.buyingPrice > 0 ? String(opt.buyingPrice) : '');
            }}
            options={variantOptions.map((o) => ({
              value: o.variantId,
              label: `${o.label} — ${o.currentStock} in stock`,
            }))}
            placeholder="Type to search a product…"
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Direction">
            <Select value={direction} onChange={(e) => setDirection(e.target.value as 'in' | 'out')}>
              <option value="in">Stock In (+)</option>
              <option value="out">Stock Out (−)</option>
            </Select>
          </Field>
          <Field label="Quantity" required>
            <Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </Field>
        </div>
        {direction === 'in' && (
          <Field label="Unit cost" hint="Optional — defaults to product reference buying price">
            <Input type="number" min="0" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
          </Field>
        )}
        <Field label="Reason" required>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Stock count correction / damaged goods" />
        </Field>
      </div>
    </Modal>
  );
}
