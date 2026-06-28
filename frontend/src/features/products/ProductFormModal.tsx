import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Field, Icon, Input, Modal, Select, Textarea } from '@/components/ui';
import { useToast } from '@/providers/ToastProvider';
import {
  useAddVariant,
  useCreateProduct,
  useDeactivateVariant,
  useUpdateProduct,
  useUpdateVariant,
  useUploadProductImage,
  type VariantInput,
} from '@/hooks/useProducts';
import { useCreateCategory } from '@/hooks/useCatalog';
import { useUploadImage } from '@/hooks/useUploads';
import { extractMessage } from '@/lib/api';
import { imageSrc } from '@/lib/utils';
import type { Category, Product } from '@/types';

interface VariantRow {
  key: string;
  id?: string;
  label: string;
  minStockLevel: string;
}

interface FormState {
  sku: string;
  name: string;
  description: string;
  categoryId: string;
  baseUnit: string;
  bulkUnit: string;
  unitSize: string;
  status: 'ACTIVE' | 'INACTIVE';
}

const EMPTY: FormState = {
  sku: '',
  name: '',
  description: '',
  categoryId: '',
  baseUnit: 'pcs',
  bulkUnit: '',
  unitSize: '',
  status: 'ACTIVE',
};

let rowSeq = 0;
const newRow = (label = ''): VariantRow => ({
  key: `r${rowSeq++}`,
  label,
  minStockLevel: '0',
});

export function ProductFormModal({
  open,
  onClose,
  product,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  product: Product | null;
  categories: Category[];
}) {
  const toast = useToast();
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const addVariant = useAddVariant();
  const updateVariant = useUpdateVariant();
  const deactivateVariant = useDeactivateVariant();
  const createCategory = useCreateCategory();
  const uploadNew = useUploadImage();
  const uploadExisting = useUploadProductImage();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [variants, setVariants] = useState<VariantRow[]>([newRow('Default')]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [createdCategories, setCreatedCategories] = useState<Category[]>([]);

  const categoryOptions = useMemo(() => {
    const byId = new Map<string, Category>();
    [...categories, ...createdCategories].forEach((c) => byId.set(c.id, c));
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [categories, createdCategories]);

  const isEdit = !!product;
  const hasBulk = form.bulkUnit.trim().length > 0;
  const saving =
    create.isPending ||
    update.isPending ||
    addVariant.isPending ||
    updateVariant.isPending ||
    uploadNew.isPending ||
    uploadExisting.isPending;

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setFile(null);
    setRemovedIds([]);
    setAddingCategory(false);
    setNewCategoryName('');
    if (product) {
      setForm({
        sku: product.sku,
        name: product.name,
        description: product.description ?? '',
        categoryId: product.categoryId ?? '',
        baseUnit: product.baseUnit || 'pcs',
        bulkUnit: product.bulkUnit ?? '',
        unitSize: product.bulkUnit ? product.unitSize.toString() : '',
        status: product.status,
      });
      setVariants(
        product.variants.map((v) => ({
          key: v.id,
          id: v.id,
          label: v.label,
          minStockLevel: v.minStockLevel.toString(),
        })),
      );
      setPreview(imageSrc(product.imageUrl));
    } else {
      setForm(EMPTY);
      setVariants([newRow('Default')]);
      setPreview(null);
    }
  }, [open, product]);

  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const setVar = (key: string, patch: Partial<VariantRow>) =>
    setVariants((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => setVariants((rows) => [...rows, newRow()]);
  const removeRow = (row: VariantRow) => {
    setVariants((rows) => rows.filter((r) => r.key !== row.key));
    if (row.id) setRemovedIds((ids) => [...ids, row.id!]);
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

    const bulkUnit = form.bulkUnit.trim();
    const productFields = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      categoryId: form.categoryId || undefined,
      baseUnit: form.baseUnit.trim() || 'pcs',
      bulkUnit,
      unitSize: bulkUnit ? Math.max(1, parseInt(form.unitSize || '1', 10)) : undefined,
      status: form.status,
    };

    try {
      if (isEdit) {
        await update.mutateAsync({ id: product!.id, input: productFields });
        // Apply variant changes: update existing, add new, deactivate removed.
        for (const v of variants) {
          if (v.id) await updateVariant.mutateAsync({ variantId: v.id, input: toVariantInput(v) });
          else await addVariant.mutateAsync({ productId: product!.id, input: toVariantInput(v) });
        }
        for (const id of removedIds) await deactivateVariant.mutateAsync(id);
        if (file) await uploadExisting.mutateAsync({ id: product!.id, file });
        toast.success('Product updated', `${productFields.name} saved successfully.`);
      } else {
        let imageUrl: string | undefined;
        if (file) imageUrl = await uploadNew.mutateAsync(file);
        await create.mutateAsync({
          ...productFields,
          imageUrl,
          variants: variants.map(toVariantInput),
        });
        toast.success('Product created', `${productFields.name} added to the catalog.`);
      }
      onClose();
    } catch (err) {
      toast.error('Save failed', extractMessage(err));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? 'Edit Product' : 'Add Product'}
      subtitle={isEdit ? product?.sku : 'Create a new catalog item'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving} icon="check">
            {isEdit ? 'Save changes' : 'Create product'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5">
        <div className="flex gap-5">
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

          <div className="grid flex-1 grid-cols-2 gap-4">
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
                  <Select
                    className="flex-1"
                    value={form.categoryId}
                    onChange={(e) => set('categoryId', e.target.value)}
                  >
                    <option value="">Uncategorized</option>
                    {categoryOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                  <Button type="button" variant="outline" icon="add" onClick={() => setAddingCategory(true)}>
                    New
                  </Button>
                </div>
              )}
            </Field>
          </div>
        </div>

        <Field label="Description">
          <Textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Optional product description…"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Status">
            <Select value={form.status} onChange={(e) => set('status', e.target.value)}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </Select>
          </Field>
        </div>

        {/* Units of measure */}
        <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
          <p className="text-label-caps uppercase tracking-wide text-on-surface-variant">Units of measure</p>
          <p className="mt-0.5 text-[12px] text-on-surface-variant">
            Stock is always counted in the base unit. Add a pack unit to also sell/buy in bulk (e.g. a Box of 12 pcs).
          </p>
          <div className="mt-3 grid grid-cols-3 gap-4">
            <Field label="Base unit" hint="e.g. pcs">
              <Input value={form.baseUnit} onChange={(e) => set('baseUnit', e.target.value)} placeholder="pcs" />
            </Field>
            <Field label="Pack unit" hint="optional">
              <Input value={form.bulkUnit} onChange={(e) => set('bulkUnit', e.target.value)} placeholder="Box" />
            </Field>
            <Field label="Pcs per pack">
              <Input
                type="number"
                min="1"
                value={form.unitSize}
                onChange={(e) => set('unitSize', e.target.value)}
                placeholder="12"
                disabled={!hasBulk}
              />
            </Field>
          </div>
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
            {/* Column headers */}
            <div className="hidden grid-cols-[1fr_0.6fr_auto] gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant sm:grid">
              <span>Label</span>
              <span>Min stock</span>
              <span />
            </div>
            {variants.map((v) => (
              <div
                key={v.key}
                className="grid grid-cols-[1fr_0.6fr_auto] gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest p-2 sm:border-0 sm:bg-transparent sm:p-0"
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
                <button
                  type="button"
                  onClick={() => removeRow(v)}
                  disabled={variants.length <= 1}
                  title="Remove variant"
                  className="flex items-center justify-center rounded-lg px-2 text-on-surface-variant transition-colors hover:text-error disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Icon name="close" size={18} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {isEdit && (
          <p className="flex items-center gap-1.5 text-[12px] text-on-surface-variant">
            <Icon name="info" size={16} /> Stock is adjusted via Purchases and Inventory, not edited here. Removing a variant
            with history deactivates it.
          </p>
        )}
      </form>
    </Modal>
  );
}
