import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Badge,
  Breadcrumbs,
  Button,
  Combobox,
  ConfirmDialog,
  Dropdown,
  ErrorState,
  Field,
  Icon,
  Input,
  LoadingState,
  PageHeader,
  Select,
} from '@/components/ui';
import { useToast } from '@/providers/ToastProvider';
import {
  useAddVariant,
  useCreateProduct,
  useDeactivateVariant,
  useProduct,
  useRemoveVariant,
  useUpdateProduct,
  useUpdateVariant,
  useUploadProductImage,
  type VariantInput,
} from '@/hooks/useProducts';
import { useCategories, useCreateCategory } from '@/hooks/useCatalog';
import { useUploadImage } from '@/hooks/useUploads';
import { extractMessage } from '@/lib/api';
import { cn, imageSrc } from '@/lib/utils';
import type { Category } from '@/types';

interface VariantRow {
  key: string;
  id?: string;
  label: string;
  minStockLevel: string;
  status: 'ACTIVE' | 'INACTIVE';
}

interface FormState {
  sku: string;
  name: string;
  categoryId: string;
  baseUnit: string;
  status: 'ACTIVE' | 'INACTIVE';
}

const EMPTY: FormState = { sku: '', name: '', categoryId: '', baseUnit: 'pcs', status: 'ACTIVE' };

let rowSeq = 0;
const newRow = (label = ''): VariantRow => ({ key: `r${rowSeq++}`, label, minStockLevel: '0', status: 'ACTIVE' });

export default function ProductFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const toast = useToast();

  const { data: product, isLoading: loadingProduct, isError, error, refetch } = useProduct(id);
  const { data: categories } = useCategories();
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const addVariant = useAddVariant();
  const updateVariant = useUpdateVariant();
  const deactivateVariant = useDeactivateVariant();
  const removeVariant = useRemoveVariant();
  const createCategory = useCreateCategory();
  const uploadNew = useUploadImage();
  const uploadExisting = useUploadProductImage();
  const fileRef = useRef<HTMLInputElement>(null);
  const initedFor = useRef<string | null>(null);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [variants, setVariants] = useState<VariantRow[]>([newRow('Default')]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [createdCategories, setCreatedCategories] = useState<Category[]>([]);
  const [deletingVariant, setDeletingVariant] = useState<VariantRow | null>(null);

  const categoryOptions = useMemo(() => {
    const byId = new Map<string, Category>();
    [...(categories ?? []), ...createdCategories].forEach((c) => byId.set(c.id, c));
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [categories, createdCategories]);

  // Populate the form from the loaded product (edit mode) once per product, so
  // background refetches (after an immediate variant action) don't clobber edits.
  // Create mode keeps the empty defaults set in initial state.
  useEffect(() => {
    if (!product || initedFor.current === product.id) return;
    initedFor.current = product.id;
    setForm({
      sku: product.sku,
      name: product.name,
      categoryId: product.categoryId ?? '',
      baseUnit: product.baseUnit || 'pcs',
      status: product.status,
    });
    setVariants(
      product.variants.map((v) => ({
        key: v.id,
        id: v.id,
        label: v.label,
        minStockLevel: v.minStockLevel.toString(),
        status: v.status,
      })),
    );
    setPreview(imageSrc(product.imageUrl));
  }, [product]);

  const saving =
    create.isPending ||
    update.isPending ||
    addVariant.isPending ||
    updateVariant.isPending ||
    uploadNew.isPending ||
    uploadExisting.isPending;

  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const setVar = (key: string, patch: Partial<VariantRow>) =>
    setVariants((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => setVariants((rows) => [...rows, newRow()]);
  /** Drops a not-yet-saved variant row (no server call). */
  const dropRow = (row: VariantRow) => setVariants((rows) => rows.filter((r) => r.key !== row.key));

  // --- Per-variant actions on already-saved variants (applied immediately) ---
  const deactivateOne = async (row: VariantRow) => {
    if (!row.id) return;
    try {
      await deactivateVariant.mutateAsync(row.id);
      setVar(row.key, { status: 'INACTIVE' });
      toast.success('Variant deactivated', `${row.label} is hidden from the till.`);
    } catch (e) {
      toast.error('Failed to deactivate', extractMessage(e));
    }
  };

  const reactivateOne = async (row: VariantRow) => {
    if (!row.id) return;
    try {
      await updateVariant.mutateAsync({ variantId: row.id, input: { status: 'ACTIVE' } });
      setVar(row.key, { status: 'ACTIVE' });
      toast.success('Variant reactivated', `${row.label} is back on the till.`);
    } catch (e) {
      toast.error('Failed to reactivate', extractMessage(e));
    }
  };

  const confirmDeleteVariant = async () => {
    if (!deletingVariant?.id) return;
    try {
      await removeVariant.mutateAsync(deletingVariant.id);
      dropRow(deletingVariant);
      toast.success('Variant deleted', `${deletingVariant.label} was permanently removed.`);
      setDeletingVariant(null);
    } catch (e) {
      toast.error('Failed to delete', extractMessage(e));
    }
  };

  const addCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) {
      toast.error('Name required', 'Enter a category name.');
      return;
    }
    try {
      const created = await createCategory.mutateAsync({ name });
      setCreatedCategories((prev) => [...prev, created]);
      set('categoryId', created.id);
      setNewCategoryName('');
      setAddingCategory(false);
      toast.success('Category created', name);
    } catch (e) {
      toast.error('Failed to create category', extractMessage(e));
    }
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (variants.length === 0) errs.variants = 'Add at least one variant';
    variants.forEach((v) => {
      if (!v.label.trim()) errs[`label-${v.key}`] = 'Required';
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const toVariantInput = (v: VariantRow): VariantInput => ({
    label: v.label.trim(),
    minStockLevel: v.minStockLevel === '' ? undefined : parseInt(v.minStockLevel, 10),
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const productFields = {
      name: form.name.trim(),
      categoryId: form.categoryId || undefined,
      baseUnit: form.baseUnit.trim() || 'pcs',
      status: form.status,
    };

    try {
      if (isEdit && product) {
        await update.mutateAsync({ id: product.id, input: productFields });
        for (const v of variants) {
          if (v.id) await updateVariant.mutateAsync({ variantId: v.id, input: toVariantInput(v) });
          else await addVariant.mutateAsync({ productId: product.id, input: toVariantInput(v) });
        }
        if (file) await uploadExisting.mutateAsync({ id: product.id, file });
        toast.success('Product updated', `${productFields.name} saved successfully.`);
        navigate(`/products/${product.id}`);
      } else {
        let imageUrl: string | undefined;
        if (file) imageUrl = await uploadNew.mutateAsync(file);
        const created = await create.mutateAsync({
          ...productFields,
          imageUrl,
          variants: variants.map(toVariantInput),
        });
        toast.success('Product created', `${productFields.name} added to the catalog.`);
        navigate(`/products/${created.id}`);
      }
    } catch (err) {
      toast.error('Save failed', extractMessage(err));
    }
  };

  const cancel = () => navigate(isEdit ? `/products/${id}` : '/products');

  return (
    <div className="flex flex-col gap-gutter pb-24">
      <div>
        <Breadcrumbs
          className="mb-3"
          items={
            isEdit
              ? [
                  { label: 'Home', to: '/' },
                  { label: 'Products', to: '/products' },
                  { label: product?.name ?? 'Product', to: `/products/${id}` },
                  { label: 'Edit' },
                ]
              : [
                  { label: 'Home', to: '/' },
                  { label: 'Products', to: '/products' },
                  { label: 'New product' },
                ]
          }
        />
        <PageHeader
          title={isEdit ? 'Edit Product' : 'New Product'}
          description={isEdit ? (product ? `SKU ${product.sku}` : undefined) : 'Create a new catalog item'}
        />
      </div>

      {isEdit && loadingProduct ? (
        <LoadingState label="Loading product…" />
      ) : isEdit && (isError || !product) ? (
        <ErrorState message={extractMessage(error)} onRetry={refetch} />
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <div className="flex flex-wrap gap-5">
            {/* Image */}
            <div className="shrink-0">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="group relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-outline-variant bg-surface-container-low transition-colors hover:border-secondary"
              >
                {preview ? (
                  <img src={preview} alt="Preview" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center text-on-surface-variant">
                    <Icon name="add_photo_alternate" size={28} />
                    <span className="mt-1 text-[11px]">Add photo</span>
                  </div>
                )}
                <span className="absolute inset-x-0 bottom-0 hidden bg-on-background/60 py-1 text-center text-[10px] font-semibold text-white group-hover:block">
                  Change
                </span>
              </button>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickFile} />
            </div>

            <div className="grid min-w-[280px] flex-1 grid-cols-2 gap-4">
              <Field label="Name" required error={errors.name} className="col-span-2">
                <Input value={form.name} onChange={(e) => set('name', e.target.value)} invalid={!!errors.name} placeholder="A4 Paper (Ream)" />
              </Field>
              {isEdit && (
                <Field label="SKU" hint="Auto-generated · not editable">
                  <Input value={form.sku} disabled readOnly />
                </Field>
              )}
              <Field label="Category" className={isEdit ? undefined : 'col-span-2'}>
                {addingCategory ? (
                  <div className="flex gap-2">
                    <Input
                      autoFocus
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addCategory();
                        }
                      }}
                      placeholder="New category name"
                    />
                    <Button type="button" icon="check" loading={createCategory.isPending} onClick={addCategory}>
                      Add
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setAddingCategory(false);
                        setNewCategoryName('');
                      }}
                      disabled={createCategory.isPending}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Combobox
                      className="flex-1"
                      value={form.categoryId}
                      onChange={(cid) => set('categoryId', cid)}
                      options={[
                        { value: '', label: 'Uncategorized' },
                        ...categoryOptions.map((c) => ({ value: c.id, label: c.name })),
                      ]}
                      placeholder="Search a category…"
                    />
                    <Button type="button" variant="outline" icon="add" onClick={() => setAddingCategory(true)}>
                      New
                    </Button>
                  </div>
                )}
              </Field>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Status">
              <Select value={form.status} onChange={(e) => set('status', e.target.value)}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </Select>
            </Field>
          </div>

          {/* Variants */}
          <div className="rounded-xl border border-outline-variant p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-label-caps uppercase tracking-wide text-on-surface-variant">Variants</p>
                <p className="mt-0.5 text-[12px] text-on-surface-variant">
                  Variants are styles of the same product (e.g. Blue, Red). Prices are set when you purchase
                  stock. Use one variant for a simple product.
                </p>
              </div>
              <Button type="button" size="sm" variant="outline" icon="add" onClick={addRow} className="shrink-0">
                Add variant
              </Button>
            </div>
            {errors.variants && <p className="mt-2 text-[12px] text-error">{errors.variants}</p>}

            <div className="mt-3 space-y-2">
              <div className="hidden grid-cols-[1fr_0.6fr_auto] gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant sm:grid">
                <span>Label</span>
                <span>Min stock</span>
                <span />
              </div>
              {variants.map((v) => {
                const inactive = v.status === 'INACTIVE';
                return (
                  <div
                    key={v.key}
                    className={cn(
                      'grid grid-cols-[1fr_0.6fr_auto] items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest p-2 sm:border-0 sm:bg-transparent sm:p-0',
                      inactive && 'opacity-60',
                    )}
                  >
                    <Input
                      value={v.label}
                      onChange={(e) => setVar(v.key, { label: e.target.value })}
                      invalid={!!errors[`label-${v.key}`]}
                      placeholder="Default"
                    />
                    <Input
                      type="number"
                      min="0"
                      value={v.minStockLevel}
                      onChange={(e) => setVar(v.key, { minStockLevel: e.target.value })}
                      placeholder="Min"
                    />
                    <div className="flex items-center justify-end gap-1.5">
                      {inactive && <Badge tone="neutral">Inactive</Badge>}
                      {v.id ? (
                        <Dropdown
                          actions={[
                            inactive
                              ? { label: 'Reactivate', icon: 'restart_alt', onClick: () => reactivateOne(v) }
                              : { label: 'Deactivate', icon: 'block', danger: true, onClick: () => deactivateOne(v) },
                            { label: 'Delete permanently', icon: 'delete', danger: true, onClick: () => setDeletingVariant(v) },
                          ]}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => dropRow(v)}
                          disabled={variants.length <= 1}
                          title="Remove variant"
                          className="flex items-center justify-center rounded-lg px-2 py-2 text-on-surface-variant transition-colors hover:text-error disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          <Icon name="close" size={18} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Unit of measure */}
          <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
            <p className="text-label-caps uppercase tracking-wide text-on-surface-variant">How it's counted</p>
            <p className="mt-0.5 text-[12px] text-on-surface-variant">
              Stock is counted and sold in single units. Pack sizes are entered when you receive stock in Purchases.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-4">
              <Field label="Single unit" hint="e.g. piece, sheet">
                <Input value={form.baseUnit} onChange={(e) => set('baseUnit', e.target.value)} placeholder="pcs" />
              </Field>
            </div>
          </div>

          {isEdit && (
            <p className="flex items-center gap-1.5 text-[12px] text-on-surface-variant">
              <Icon name="info" size={16} /> Stock is adjusted via Purchases and Inventory, not edited here. Removing a variant
              with history deactivates it.
            </p>
          )}

          {/* Sticky action bar — offset to clear the sidebar on desktop */}
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-outline-variant bg-surface-container-lowest/95 backdrop-blur lg:left-64">
            <div className="mx-auto flex max-w-[1600px] items-center justify-end gap-3 p-4 sm:px-container-padding">
              <Button type="button" variant="outline" onClick={cancel} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" loading={saving} icon="check">
                {isEdit ? 'Save changes' : 'Create product'}
              </Button>
            </div>
          </div>
        </form>
      )}

      <ConfirmDialog
        open={!!deletingVariant}
        onClose={() => setDeletingVariant(null)}
        onConfirm={confirmDeleteVariant}
        loading={removeVariant.isPending}
        tone="danger"
        icon="delete"
        title="Delete variant permanently?"
        message={`"${deletingVariant?.label}" will be permanently deleted. This cannot be undone. Variants with any sales, purchases or stock history can't be deleted — deactivate them instead.`}
        confirmLabel="Delete"
      />
    </div>
  );
}
