import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Badge,
  Breadcrumbs,
  Button,
  Card,
  ConfirmDialog,
  Dropdown,
  ErrorState,
  Icon,
  LoadingState,
  PageHeader,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import {
  useDeleteProduct,
  useProduct,
  useRemoveProduct,
  useUpdateProduct,
} from '@/hooks/useProducts';
import { useMovements } from '@/hooks/useInventory';
import { extractMessage } from '@/lib/api';
import { cn, currency, formatDateTime, humanize, imageSrc, num } from '@/lib/utils';

const MOVE_TONE: Record<string, 'success' | 'error' | 'warning' | 'neutral'> = {
  PURCHASE: 'success',
  RETURN: 'success',
  SALE: 'neutral',
  ADJUSTMENT: 'warning',
};

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = useAuth();
  const canManage = can('products');
  const toast = useToast();

  const { data, isLoading, isError, error, refetch } = useProduct(id);
  const movements = useMovements({ productId: id, limit: 15 });
  const update = useUpdateProduct();
  const del = useDeleteProduct();
  const remove = useRemoveProduct();

  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);

  const variants = data?.variants ?? [];
  const totalStock = variants.reduce((a, v) => a + v.currentStock, 0);
  const stockValue = variants.reduce((a, v) => a + v.currentStock * num(v.buyingPrice), 0);
  const lowStock = variants.some((v) => v.status === 'ACTIVE' && v.currentStock <= v.minStockLevel);

  const reactivate = async () => {
    if (!data) return;
    try {
      await update.mutateAsync({ id: data.id, input: { status: 'ACTIVE' } });
      toast.success('Product reactivated', `${data.name} is now active.`);
    } catch (e) {
      toast.error('Failed to reactivate', extractMessage(e));
    }
  };

  const confirmDeactivate = async () => {
    if (!data) return;
    try {
      await del.mutateAsync(data.id);
      toast.success('Product deactivated', `${data.name} is now inactive.`);
      setDeactivateOpen(false);
    } catch (e) {
      toast.error('Failed to deactivate', extractMessage(e));
    }
  };

  const confirmRemove = async () => {
    if (!data) return;
    try {
      await remove.mutateAsync(data.id);
      toast.success('Product deleted', `${data.name} was permanently removed.`);
      navigate('/products');
    } catch (e) {
      toast.error('Failed to delete', extractMessage(e));
    }
  };

  const src = data ? imageSrc(data.imageUrl) : null;

  return (
    <div className="flex flex-col gap-gutter">
      <div>
        <Breadcrumbs
          className="mb-3"
          items={[
            { label: 'Home', to: '/' },
            { label: 'Products', to: '/products' },
            { label: data?.name ?? 'Product' },
          ]}
        />
        <PageHeader
          title={data?.name ?? 'Product'}
          description={data ? `SKU ${data.sku}` : undefined}
          actions={
            data &&
            canManage && (
              <div className="flex gap-2">
                <Button variant="outline" icon="edit" onClick={() => navigate(`/products/${data.id}/edit`)}>
                  Edit
                </Button>
                <Dropdown
                  actions={[
                    data.status === 'ACTIVE'
                      ? { label: 'Deactivate', icon: 'block', danger: true, onClick: () => setDeactivateOpen(true) }
                      : { label: 'Reactivate', icon: 'restart_alt', onClick: reactivate },
                    { label: 'Delete permanently', icon: 'delete', danger: true, onClick: () => setRemoveOpen(true) },
                  ]}
                />
              </div>
            )
          }
        />
      </div>

      {isLoading ? (
        <LoadingState label="Loading product…" />
      ) : isError || !data ? (
        <ErrorState message={extractMessage(error)} onRetry={refetch} />
      ) : (
        <div className="flex flex-col gap-gutter">
          {/* Hero: image + key facts */}
          <Card className="flex flex-wrap items-center gap-4 p-4">
            {src ? (
              <img src={src} alt={data.name} className="h-20 w-20 shrink-0 rounded-xl border border-outline-variant object-cover" />
            ) : (
              <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-surface-container text-on-surface-variant">
                <Icon name="inventory_2" size={32} />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={data.status === 'ACTIVE' ? 'success' : 'neutral'}>
                  {data.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                </Badge>
                {lowStock && <Badge tone="error">Low stock</Badge>}
                <span className="text-body-sm text-on-surface-variant">{data.category?.name ?? 'Uncategorized'}</span>
              </div>
              <p className="mt-1 text-[13px] text-on-surface-variant">
                Sold by the <span className="font-medium text-on-surface">{data.baseUnit}</span>
                {data.bulkUnit ? ` · packs of ${data.unitSize} ${data.baseUnit} (${data.bulkUnit})` : ''}
                {' · '}
                {variants.length} variant{variants.length === 1 ? '' : 's'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Stat label="In stock" value={`${totalStock}`} hint={data.baseUnit} />
              <Stat label="Stock value" value={currency(stockValue)} hint="at buying price" />
            </div>
          </Card>

          {/* Variants */}
          <div>
            <p className="mb-2 text-label-caps uppercase tracking-wide text-on-surface-variant">Variants</p>
            <Card className="overflow-hidden">
              <Table>
                <THead>
                  <TH>Variant</TH>
                  <TH>SKU</TH>
                  <TH align="right">Buying</TH>
                  <TH align="right">Selling</TH>
                  <TH align="right">Wholesale</TH>
                  <TH align="center">Stock</TH>
                  <TH align="center">Min</TH>
                  <TH align="center">Status</TH>
                </THead>
                <TBody>
                  {variants.map((v) => {
                    const low = v.status === 'ACTIVE' && v.currentStock <= v.minStockLevel;
                    return (
                      <TR key={v.id}>
                        <TD className="font-medium">{v.label && v.label !== 'Default' ? v.label : '—'}</TD>
                        <TD className="font-mono-data text-on-surface-variant">{v.sku}</TD>
                        <TD align="right" className="font-mono-data">{num(v.buyingPrice) > 0 ? currency(v.buyingPrice) : '—'}</TD>
                        <TD align="right" className="font-mono-data font-semibold">{num(v.sellingPrice) > 0 ? currency(v.sellingPrice) : '—'}</TD>
                        <TD align="right" className="font-mono-data">{v.wholesalePrice && num(v.wholesalePrice) > 0 ? currency(v.wholesalePrice) : '—'}</TD>
                        <TD align="center">
                          <span className={cn('inline-flex items-center gap-1 font-mono-data font-semibold', low ? 'text-error' : 'text-on-surface')}>
                            {low && <Icon name="warning" size={15} />}
                            {v.currentStock}
                          </span>
                        </TD>
                        <TD align="center" className="font-mono-data text-on-surface-variant">{v.minStockLevel}</TD>
                        <TD align="center">
                          <Badge tone={v.status === 'ACTIVE' ? 'success' : 'neutral'}>
                            {v.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                          </Badge>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </Card>
          </div>

          {/* Recent stock movements */}
          <div>
            <p className="mb-2 text-label-caps uppercase tracking-wide text-on-surface-variant">Recent stock movements</p>
            {movements.isLoading ? (
              <LoadingState />
            ) : (movements.data?.data.length ?? 0) === 0 ? (
              <p className="text-body-sm text-on-surface-variant">No stock movements yet.</p>
            ) : (
              <Card className="overflow-hidden">
                <Table>
                  <THead>
                    <TH>When</TH>
                    <TH>Variant</TH>
                    <TH align="center">Type</TH>
                    <TH align="right">Change</TH>
                    <TH align="right">Balance</TH>
                    <TH>By</TH>
                  </THead>
                  <TBody>
                    {movements.data!.data.map((m) => {
                      const delta = m.afterQty - m.beforeQty;
                      return (
                        <TR key={m.id}>
                          <TD className="whitespace-nowrap text-on-surface-variant">{formatDateTime(m.createdAt)}</TD>
                          <TD className="text-on-surface-variant">{m.variant?.label && m.variant.label !== 'Default' ? m.variant.label : m.variant?.sku ?? '—'}</TD>
                          <TD align="center">
                            <Badge tone={MOVE_TONE[m.type] ?? 'neutral'}>{humanize(m.type)}</Badge>
                          </TD>
                          <TD align="right" className={cn('font-mono-data font-semibold', delta > 0 ? 'text-secondary' : delta < 0 ? 'text-error' : 'text-on-surface-variant')}>
                            {delta > 0 ? `+${delta}` : delta}
                          </TD>
                          <TD align="right" className="font-mono-data text-on-surface-variant">
                            {m.beforeQty} → {m.afterQty}
                          </TD>
                          <TD className="text-on-surface-variant">{m.user?.fullName ?? 'System'}</TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              </Card>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deactivateOpen}
        onClose={() => setDeactivateOpen(false)}
        onConfirm={confirmDeactivate}
        loading={del.isPending}
        title="Deactivate product?"
        message={`"${data?.name}" will be hidden from POS and catalog but its history is preserved.`}
        confirmLabel="Deactivate"
        icon="block"
      />
      <ConfirmDialog
        open={removeOpen}
        onClose={() => setRemoveOpen(false)}
        onConfirm={confirmRemove}
        loading={remove.isPending}
        title="Delete product permanently?"
        message={`"${data?.name}" will be permanently deleted. This cannot be undone. Products with any sales, purchases or stock history can't be deleted — deactivate them instead.`}
        confirmLabel="Delete"
        icon="delete"
      />
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-on-surface-variant">{label}</p>
      <p className="font-mono-data text-h3 font-bold text-on-surface">{value}</p>
      {hint && <p className="text-[11px] text-on-surface-variant">{hint}</p>}
    </div>
  );
}
