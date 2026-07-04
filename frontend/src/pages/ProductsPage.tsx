import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dropdown,
  EmptyState,
  ErrorState,
  Icon,
  LoadingState,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from '@/components/ui';
import { CategoryManagerModal } from '@/features/products/CategoryManagerModal';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import {
  useDeleteProduct,
  useProducts,
  useRemoveProduct,
  useUpdateProduct,
} from '@/hooks/useProducts';
import { useCategories } from '@/hooks/useCatalog';
import { extractMessage } from '@/lib/api';
import { cn, currency, imageSrc, num } from '@/lib/utils';
import type { Product, ProductStatus } from '@/types';

export default function ProductsPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const canManage = can('products');
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ProductStatus | ''>('');
  const [categoryId, setCategoryId] = useState('');
  const [lowStock, setLowStock] = useState(false);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [removing, setRemoving] = useState<Product | null>(null);
  const [catManagerOpen, setCatManagerOpen] = useState(false);

  const filters = {
    page,
    limit: 12,
    search: search || undefined,
    status: status || undefined,
    categoryId: categoryId || undefined,
    lowStock: lowStock || undefined,
  };
  const { data, isLoading, isError, refetch, error } = useProducts(filters);
  const { data: categories } = useCategories();
  const del = useDeleteProduct();
  const update = useUpdateProduct();
  const remove = useRemoveProduct();

  const openCreate = () => navigate('/products/new');
  const openEdit = (p: Product) => navigate(`/products/${p.id}/edit`);

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await del.mutateAsync(deleting.id);
      toast.success('Product deactivated', `${deleting.name} is now inactive.`);
      setDeleting(null);
    } catch (e) {
      toast.error('Failed to deactivate', extractMessage(e));
    }
  };

  const handleReactivate = async (p: Product) => {
    try {
      await update.mutateAsync({ id: p.id, input: { status: 'ACTIVE' } });
      toast.success('Product reactivated', `${p.name} is now active.`);
    } catch (e) {
      toast.error('Failed to reactivate', extractMessage(e));
    }
  };

  const confirmRemove = async () => {
    if (!removing) return;
    try {
      await remove.mutateAsync(removing.id);
      toast.success('Product deleted', `${removing.name} was permanently removed.`);
      setRemoving(null);
    } catch (e) {
      toast.error('Failed to delete', extractMessage(e));
    }
  };

  return (
    <div className="flex flex-col gap-gutter">
      <PageHeader
        title="Products"
        description="Manage your stationery catalog, pricing, and stock thresholds."
        actions={
          canManage && (
            <>
              <Button variant="outline" icon="category" onClick={() => setCatManagerOpen(true)}>
                Categories
              </Button>
              <Button icon="add" onClick={openCreate}>
                Add Product
              </Button>
            </>
          )
        }
      />

      <Card>
        {/* Filter bar */}
        <div className="flex flex-col gap-3 border-b border-outline-variant p-4 lg:flex-row lg:items-center">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search by name or SKU…"
            className="flex-1"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setPage(1);
              }}
              className="w-44"
            >
              <option value="">All categories</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as ProductStatus | '');
                setPage(1);
              }}
              className="w-36"
            >
              <option value="">All status</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </Select>
            <Button
              variant={lowStock ? 'secondary' : 'outline'}
              icon="warning"
              onClick={() => {
                setLowStock((v) => !v);
                setPage(1);
              }}
            >
              Low Stock
            </Button>
          </div>
        </div>

        {isLoading ? (
          <LoadingState label="Loading products…" />
        ) : isError ? (
          <ErrorState message={extractMessage(error)} onRetry={refetch} />
        ) : data!.data.length === 0 ? (
          <EmptyState
            icon="inventory_2"
            title="No products found"
            description="Try adjusting your filters, or add your first product."
            action={canManage && <Button icon="add" onClick={openCreate}>Add Product</Button>}
          />
        ) : (
          <>
            <Table>
              <THead>
                <TH>Product</TH>
                <TH>SKU</TH>
                <TH>Category</TH>
                <TH align="right">Buying</TH>
                <TH align="right">Selling</TH>
                <TH align="center">Stock</TH>
                <TH align="center">Status</TH>
                {canManage && <TH align="right">Actions</TH>}
              </THead>
              <TBody>
                {data!.data.map((p) => {
                  const totalStock = p.variants.reduce((a, v) => a + v.currentStock, 0);
                  const low = p.variants.some(
                    (v) => v.status === 'ACTIVE' && v.currentStock <= v.minStockLevel,
                  );
                  const multi = p.variants.length > 1;
                  return (
                    <TR key={p.id} onClick={() => navigate(`/products/${p.id}`)}>
                      <TD>
                        <div className="flex items-center gap-3">
                          <ProductThumb product={p} />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-on-surface">{p.name}</p>
                            <p className="truncate text-[12px] text-on-surface-variant">
                              {multi ? `${p.variants.length} variants` : 'Single variant'}
                            </p>
                          </div>
                        </div>
                      </TD>
                      <TD className="font-mono-data text-on-surface-variant">{p.sku}</TD>
                      <TD>{p.category?.name ?? '—'}</TD>
                      <TD align="right" className="font-mono-data">{priceRange(p, 'buyingPrice')}</TD>
                      <TD align="right" className="font-mono-data font-semibold">{priceRange(p, 'sellingPrice')}</TD>
                      <TD align="center">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 font-mono-data font-semibold',
                            low ? 'text-error' : 'text-on-surface',
                          )}
                        >
                          {low && <Icon name="warning" size={16} />}
                          {totalStock}
                        </span>
                        <p className="text-[10px] text-on-surface-variant">
                          {multi ? `across ${p.variants.length}` : 'in stock'}
                        </p>
                      </TD>
                      <TD align="center">
                        <Badge tone={p.status === 'ACTIVE' ? 'success' : 'neutral'}>
                          {p.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                        </Badge>
                      </TD>
                      {canManage && (
                        <TD align="right">
                          <div className="inline-flex" onClick={(e) => e.stopPropagation()}>
                          <Dropdown
                            actions={[
                              { label: 'Edit product', icon: 'edit', onClick: () => openEdit(p) },
                              p.status === 'ACTIVE'
                                ? {
                                    label: 'Deactivate',
                                    icon: 'block',
                                    danger: true,
                                    onClick: () => setDeleting(p),
                                  }
                                : {
                                    label: 'Reactivate',
                                    icon: 'restart_alt',
                                    onClick: () => handleReactivate(p),
                                  },
                              {
                                label: 'Delete permanently',
                                icon: 'delete',
                                danger: true,
                                onClick: () => setRemoving(p),
                              },
                            ]}
                          />
                          </div>
                        </TD>
                      )}
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            <Pagination meta={data!.meta} onPage={setPage} />
          </>
        )}
      </Card>

      <CategoryManagerModal open={catManagerOpen} onClose={() => setCatManagerOpen(false)} />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={del.isPending}
        title="Deactivate product?"
        message={`"${deleting?.name}" will be hidden from POS and catalog but its history is preserved.`}
        confirmLabel="Deactivate"
        icon="block"
      />

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={confirmRemove}
        loading={remove.isPending}
        title="Delete product permanently?"
        message={`"${removing?.name}" will be permanently deleted. This cannot be undone. Products with any sales, purchases or stock history can't be deleted — deactivate them instead.`}
        confirmLabel="Delete"
        icon="delete"
      />
    </div>
  );
}

/** Single price, or a min–max range when variants differ. */
function priceRange(product: Product, field: 'sellingPrice' | 'buyingPrice'): string {
  const vals = product.variants.map((v) => num(v[field]));
  // Prices are set on first purchase; until then a variant sits at 0 ("not set").
  if (vals.length === 0 || Math.max(...vals) === 0) return '—';
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  return min === max ? currency(min) : `${currency(min)} – ${currency(max)}`;
}

function ProductThumb({ product }: { product: Product }) {
  const src = imageSrc(product.imageUrl);
  if (src) {
    return (
      <img
        src={src}
        alt={product.name}
        className="h-10 w-10 shrink-0 rounded-lg border border-outline-variant object-cover"
      />
    );
  }
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-container text-on-surface-variant">
      <Icon name="inventory_2" size={20} />
    </span>
  );
}
