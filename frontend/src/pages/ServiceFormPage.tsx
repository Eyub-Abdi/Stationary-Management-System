import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Breadcrumbs,
  Button,
  Combobox,
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
  useAddServiceVariant,
  useCreateService,
  useDeactivateServiceVariant,
  useService,
  useUpdateService,
  useUpdateServiceVariant,
  type ServiceInput,
  type ServiceVariantInput,
} from '@/hooks/useCatalog';
import { useProducts } from '@/hooks/useProducts';
import { DEFAULT_SERVICE_ICON, PRICING_TYPE_OPTIONS } from '@/lib/constants';
import { extractMessage } from '@/lib/api';
import { num } from '@/lib/utils';
import type { PricingType } from '@/types';

interface ServiceFormState {
  name: string;
  icon: string;
  pricingType: PricingType;
  status: 'ACTIVE' | 'INACTIVE';
}

// One bill-of-materials row: a product the option consumes.
interface ComponentRow {
  key: string;
  variantId: string;
  qty: string;
  perPage: boolean;
}

interface OptionRow {
  key: string;
  id?: string;
  label: string;
  unitPrice: string;
  components: ComponentRow[];
}

let optSeq = 0;
const newOpt = (label = ''): OptionRow => ({
  key: `o${optSeq++}`,
  label,
  unitPrice: '',
  components: [],
});

let compSeq = 0;
const newComp = (): ComponentRow => ({
  key: `c${compSeq++}`,
  variantId: '',
  qty: '1',
  perPage: true,
});

export default function ServiceFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const toast = useToast();

  const { data: service, isLoading, isError, error, refetch } = useService(id);
  const create = useCreateService();
  const update = useUpdateService();
  const addVariant = useAddServiceVariant();
  const updateVariant = useUpdateServiceVariant();
  const deactivateVariant = useDeactivateServiceVariant();
  const { data: products } = useProducts({ status: 'ACTIVE', limit: 100 });
  const initedFor = useRef<string | null>(null);

  // Flat list of sellable product variants a service option can consume (paper, etc.).
  const consumableOptions = (products?.data ?? []).flatMap((p) =>
    p.variants
      .filter((v) => v.status === 'ACTIVE')
      .map((v) => ({
        id: v.id,
        label:
          (v.label && v.label !== 'Default' ? `${p.name} — ${v.label}` : p.name) +
          ` (${v.currentStock} ${p.baseUnit})`,
      })),
  );

  const [form, setForm] = useState<ServiceFormState>({
    name: '',
    icon: DEFAULT_SERVICE_ICON,
    pricingType: 'PER_PAGE',
    status: 'ACTIVE',
  });
  const [options, setOptions] = useState<OptionRow[]>([newOpt('Standard')]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Populate from the loaded service once per service (edit mode). Create mode
  // keeps the empty defaults set in initial state.
  useEffect(() => {
    if (!service || initedFor.current === service.id) return;
    initedFor.current = service.id;
    setForm({
      name: service.name,
      icon: service.icon ?? DEFAULT_SERVICE_ICON,
      pricingType: service.pricingType,
      status: service.status,
    });
    setOptions(
      service.variants.map((v) => ({
        key: v.id,
        id: v.id,
        label: v.label,
        unitPrice: num(v.unitPrice).toString(),
        components: (v.components ?? []).map((c) => ({
          key: c.id,
          variantId: c.variantId,
          qty: (c.qty ?? 1).toString(),
          perPage: c.perPage,
        })),
      })),
    );
  }, [service]);

  const saving =
    create.isPending ||
    update.isPending ||
    addVariant.isPending ||
    updateVariant.isPending ||
    deactivateVariant.isPending;

  const setOpt = (key: string, patch: Partial<OptionRow>) =>
    setOptions((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => setOptions((rows) => [...rows, newOpt()]);
  const removeRow = (row: OptionRow) => {
    setOptions((rows) => rows.filter((r) => r.key !== row.key));
    if (row.id) setRemovedIds((ids) => [...ids, row.id!]);
  };

  // Bill-of-materials rows within one option.
  const addComp = (optKey: string) =>
    setOptions((rows) =>
      rows.map((r) => (r.key === optKey ? { ...r, components: [...r.components, newComp()] } : r)),
    );
  const setComp = (optKey: string, compKey: string, patch: Partial<ComponentRow>) =>
    setOptions((rows) =>
      rows.map((r) =>
        r.key === optKey
          ? { ...r, components: r.components.map((c) => (c.key === compKey ? { ...c, ...patch } : c)) }
          : r,
      ),
    );
  const removeComp = (optKey: string, compKey: string) =>
    setOptions((rows) =>
      rows.map((r) =>
        r.key === optKey ? { ...r, components: r.components.filter((c) => c.key !== compKey) } : r,
      ),
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (options.length === 0) errs.options = 'Add at least one option';
    options.forEach((o) => {
      if (!o.label.trim()) errs[`label-${o.key}`] = 'Required';
      if (o.unitPrice === '' || num(o.unitPrice) < 0) errs[`price-${o.key}`] = 'Required';
    });
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const serviceFields: ServiceInput = {
      name: form.name.trim(),
      icon: form.icon,
      pricingType: form.pricingType,
      status: form.status,
    };
    const toInput = (o: OptionRow): ServiceVariantInput => ({
      label: o.label.trim(),
      unitPrice: num(o.unitPrice),
      components: o.components
        .filter((c) => c.variantId)
        .map((c) => ({
          variantId: c.variantId,
          qty: Math.max(1, parseInt(c.qty || '1', 10)),
          // Per-page only means anything for per-page pricing; flat otherwise.
          perPage: form.pricingType === 'PER_PAGE' ? c.perPage : false,
        })),
    });
    try {
      if (isEdit && service) {
        await update.mutateAsync({ id: service.id, input: serviceFields });
        for (const o of options) {
          if (o.id) await updateVariant.mutateAsync({ variantId: o.id, input: toInput(o) });
          else await addVariant.mutateAsync({ serviceId: service.id, input: toInput(o) });
        }
        for (const rid of removedIds) await deactivateVariant.mutateAsync(rid);
        toast.success('Service updated', serviceFields.name);
      } else {
        await create.mutateAsync({ ...serviceFields, variants: options.map(toInput) });
        toast.success('Service created', serviceFields.name);
      }
      navigate('/services');
    } catch (err) {
      toast.error('Save failed', extractMessage(err));
    }
  };

  const cancel = () => navigate('/services');

  return (
    <div className="flex flex-col gap-gutter pb-24">
      <div>
        <Breadcrumbs
          className="mb-3"
          items={[
            { label: 'Home', to: '/' },
            { label: 'Services', to: '/services' },
            { label: isEdit ? (service?.name ?? 'Service') : 'New service' },
          ]}
        />
        <PageHeader
          title={isEdit ? 'Edit Service' : 'Add Service'}
          description={
            isEdit
              ? 'Update pricing, options and the products each option consumes.'
              : 'Printing, photocopying, scanning and lamination — set pricing and stock usage.'
          }
        />
      </div>

      {isEdit && isLoading ? (
        <LoadingState label="Loading service…" />
      ) : isEdit && (isError || !service) ? (
        <ErrorState message={extractMessage(error)} onRetry={refetch} />
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <div className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Service name" required error={errors.name} className="sm:col-span-2">
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                invalid={!!errors.name}
                placeholder="Printing — Black & White"
              />
            </Field>
            <Field label="Pricing type" required>
              <Select
                value={form.pricingType}
                onChange={(e) => setForm((f) => ({ ...f, pricingType: e.target.value as PricingType }))}
              >
                {PRICING_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as 'ACTIVE' | 'INACTIVE' }))}
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </Select>
            </Field>
          </div>

          {/* Options (e.g. paper sizes) */}
          <div className="rounded-xl border border-outline-variant p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-label-caps uppercase tracking-wide text-on-surface-variant">Options</p>
                <p className="mt-0.5 text-[12px] text-on-surface-variant">
                  e.g. A4 and A3, each with its own {form.pricingType === 'PER_PAGE' ? 'per-page' : 'fixed'} price. Use one
                  option for a simple service.
                </p>
              </div>
              <Button type="button" size="sm" variant="outline" icon="add" onClick={addRow} className="shrink-0">
                Add option
              </Button>
            </div>
            {errors.options && <p className="mt-2 text-[12px] text-error">{errors.options}</p>}
            <div className="mt-3 space-y-2">
              {options.map((o) => (
                <div key={o.key} className="space-y-2 rounded-lg border border-outline-variant p-2">
                  <div className="flex items-center gap-2">
                    <Input
                      value={o.label}
                      onChange={(e) => setOpt(o.key, { label: e.target.value })}
                      invalid={!!errors[`label-${o.key}`]}
                      placeholder="A4"
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={o.unitPrice}
                      onChange={(e) => setOpt(o.key, { unitPrice: e.target.value })}
                      invalid={!!errors[`price-${o.key}`]}
                      placeholder="Price"
                      className="w-32"
                    />
                    <button
                      type="button"
                      onClick={() => removeRow(o)}
                      disabled={options.length <= 1}
                      title="Remove option"
                      className="flex items-center justify-center rounded-lg px-2 py-2 text-on-surface-variant transition-colors hover:text-error disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <Icon name="close" size={18} />
                    </button>
                  </div>
                  {/* Uses: the products this option consumes (its bill of materials). */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-medium text-on-surface-variant">Uses</span>
                      <button
                        type="button"
                        onClick={() => addComp(o.key)}
                        className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[12px] font-medium text-primary transition-colors hover:bg-primary/10"
                      >
                        <Icon name="add" size={14} /> Add product
                      </button>
                    </div>
                    {o.components.length === 0 ? (
                      <p className="text-[11px] text-on-surface-variant">
                        No products consumed (e.g. scanning). Add a product to draw down stock per sale.
                      </p>
                    ) : (
                      o.components.map((c) => (
                        <div key={c.key} className="flex items-center gap-2">
                          <Combobox
                            value={c.variantId}
                            onChange={(vid) => setComp(o.key, c.key, { variantId: vid })}
                            className="flex-1"
                            options={consumableOptions.map((p) => ({ value: p.id, label: p.label }))}
                            placeholder="Search a product…"
                          />
                          <Input
                            type="number"
                            min="1"
                            value={c.qty}
                            onChange={(e) => setComp(o.key, c.key, { qty: e.target.value })}
                            className="w-14"
                          />
                          {form.pricingType === 'PER_PAGE' ? (
                            <Select
                              value={c.perPage ? 'page' : 'job'}
                              onChange={(e) => setComp(o.key, c.key, { perPage: e.target.value === 'page' })}
                              className="w-24"
                            >
                              <option value="page">/ page</option>
                              <option value="job">/ job</option>
                            </Select>
                          ) : (
                            <span className="w-24 shrink-0 text-[12px] text-on-surface-variant">/ job</span>
                          )}
                          <button
                            type="button"
                            onClick={() => removeComp(o.key, c.key)}
                            title="Remove product"
                            className="flex items-center justify-center rounded-lg px-2 py-2 text-on-surface-variant transition-colors hover:text-error"
                          >
                            <Icon name="close" size={16} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sticky action bar — offset to clear the sidebar on desktop */}
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-outline-variant bg-surface-container-lowest/95 backdrop-blur lg:left-64">
            <div className="mx-auto flex max-w-[1600px] items-center justify-end gap-3 p-4 sm:px-container-padding">
              <Button type="button" variant="outline" onClick={cancel} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" loading={saving} icon="check">
                {isEdit ? 'Save changes' : 'Create service'}
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
