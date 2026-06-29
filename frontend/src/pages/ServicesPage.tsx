import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dropdown,
  EmptyState,
  ErrorState,
  Field,
  Icon,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  SearchInput,
  Select,
} from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import {
  useAddServiceVariant,
  useCreateService,
  useDeactivateServiceVariant,
  useDeleteService,
  useReactivateService,
  useRemoveService,
  useServices,
  useUpdateService,
  useUpdateServiceVariant,
  type ServiceInput,
  type ServiceVariantInput,
} from '@/hooks/useCatalog';
import { DEFAULT_SERVICE_ICON, PRICING_TYPE_OPTIONS } from '@/lib/constants';
import { extractMessage } from '@/lib/api';
import { currency, num } from '@/lib/utils';
import type { PricingType, Service } from '@/types';

/** Single price, or a min–max range when options differ. */
function servicePriceLabel(s: Service): string {
  const vals = s.variants.map((v) => num(v.unitPrice));
  if (vals.length === 0) return '—';
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  return min === max ? currency(min) : `${currency(min)} – ${currency(max)}`;
}

export default function ServicesPage() {
  const { can } = useAuth();
  const canManage = can('services');
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [deleting, setDeleting] = useState<Service | null>(null);
  const [removing, setRemoving] = useState<Service | null>(null);

  const { data, isLoading, isError, refetch, error } = useServices({
    search: search || undefined,
    limit: 100,
    includeInactive: canManage,
  });
  const del = useDeleteService();
  const reactivate = useReactivateService();
  const remove = useRemoveService();

  const services = data?.data ?? [];

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await del.mutateAsync(deleting.id);
      toast.success('Service deactivated', `${deleting.name} is now inactive.`);
      setDeleting(null);
    } catch (e) {
      toast.error('Failed', extractMessage(e));
    }
  };

  const handleReactivate = async (s: Service) => {
    try {
      await reactivate.mutateAsync(s.id);
      toast.success('Service reactivated', `${s.name} is now active.`);
    } catch (e) {
      toast.error('Failed', extractMessage(e));
    }
  };

  const confirmRemove = async () => {
    if (!removing) return;
    try {
      await remove.mutateAsync(removing.id);
      toast.success('Service deleted', `${removing.name} was permanently removed.`);
      setRemoving(null);
    } catch (e) {
      toast.error('Failed', extractMessage(e));
    }
  };

  return (
    <div className="flex flex-col gap-gutter">
      <PageHeader
        title="Services"
        description="Printing, photocopying, scanning and lamination — set pricing per service."
        actions={
          canManage && (
            <Button
              icon="add"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              Add Service
            </Button>
          )
        }
      />

      <div className="max-w-md">
        <SearchInput value={search} onChange={setSearch} placeholder="Search services…" />
      </div>

      {isLoading ? (
        <Card>
          <LoadingState label="Loading services…" />
        </Card>
      ) : isError ? (
        <Card>
          <ErrorState message={extractMessage(error)} onRetry={refetch} />
        </Card>
      ) : services.length === 0 ? (
        <Card>
          <EmptyState
            icon="print"
            title="No services configured"
            description="Add your printing and copying services to start selling them at the POS."
            action={canManage && <Button icon="add" onClick={() => setFormOpen(true)}>Add Service</Button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-gutter sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {services.map((s) => (
            <Card key={s.id} className="flex flex-col p-5">
              <div className="mb-4 flex items-start justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-fixed text-on-primary-fixed">
                  <Icon name={s.icon ?? DEFAULT_SERVICE_ICON} size={22} />
                </span>
                {canManage && (
                  <Dropdown
                    actions={[
                      {
                        label: 'Edit',
                        icon: 'edit',
                        onClick: () => {
                          setEditing(s);
                          setFormOpen(true);
                        },
                      },
                      ...(s.status === 'ACTIVE'
                        ? [
                            {
                              label: 'Deactivate',
                              icon: 'block',
                              danger: true,
                              onClick: () => setDeleting(s),
                            },
                          ]
                        : [
                            {
                              label: 'Reactivate',
                              icon: 'restart_alt',
                              onClick: () => handleReactivate(s),
                            },
                            {
                              label: 'Delete permanently',
                              icon: 'delete',
                              danger: true,
                              onClick: () => setRemoving(s),
                            },
                          ]),
                    ]}
                  />
                )}
              </div>
              <h3 className="text-body-lg font-semibold text-on-surface">{s.name}</h3>
              <div className="mt-4 flex items-end justify-between">
                <div>
                  <p className="font-mono-data text-h3 font-bold text-primary">{servicePriceLabel(s)}</p>
                  <p className="text-[11px] text-on-surface-variant">
                    {s.variants.length > 1 ? `${s.variants.length} options · ` : ''}
                    {s.pricingType === 'PER_PAGE' ? 'per page' : 'fixed price'}
                  </p>
                </div>
                <Badge tone={s.status === 'ACTIVE' ? 'success' : 'neutral'}>
                  {s.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ServiceFormModal open={formOpen} onClose={() => setFormOpen(false)} service={editing} />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={del.isPending}
        title="Deactivate service?"
        message={`"${deleting?.name}" will be removed from the POS service list.`}
        confirmLabel="Deactivate"
        icon="block"
      />

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={confirmRemove}
        loading={remove.isPending}
        title="Delete service permanently?"
        message={`"${removing?.name}" will be permanently deleted. This cannot be undone. Services used by past sales cannot be deleted — deactivate them instead.`}
        confirmLabel="Delete"
        icon="delete"
      />
    </div>
  );
}

interface ServiceFormState {
  name: string;
  icon: string;
  pricingType: PricingType;
  status: 'ACTIVE' | 'INACTIVE';
}

interface OptionRow {
  key: string;
  id?: string;
  label: string;
  unitPrice: string;
}

let optSeq = 0;
const newOpt = (label = ''): OptionRow => ({ key: `o${optSeq++}`, label, unitPrice: '' });

function ServiceFormModal({
  open,
  onClose,
  service,
}: {
  open: boolean;
  onClose: () => void;
  service: Service | null;
}) {
  const toast = useToast();
  const create = useCreateService();
  const update = useUpdateService();
  const addVariant = useAddServiceVariant();
  const updateVariant = useUpdateServiceVariant();
  const deactivateVariant = useDeactivateServiceVariant();
  const isEdit = !!service;
  const saving =
    create.isPending ||
    update.isPending ||
    addVariant.isPending ||
    updateVariant.isPending ||
    deactivateVariant.isPending;

  const [form, setForm] = useState<ServiceFormState>({
    name: '',
    icon: DEFAULT_SERVICE_ICON,
    pricingType: 'PER_PAGE',
    status: 'ACTIVE',
  });
  const [options, setOptions] = useState<OptionRow[]>([newOpt('Standard')]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setRemovedIds([]);
    if (service) {
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
        })),
      );
    } else {
      setForm({ name: '', icon: DEFAULT_SERVICE_ICON, pricingType: 'PER_PAGE', status: 'ACTIVE' });
      setOptions([newOpt('Standard')]);
    }
  }, [open, service]);

  const setOpt = (key: string, patch: Partial<OptionRow>) =>
    setOptions((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => setOptions((rows) => [...rows, newOpt()]);
  const removeRow = (row: OptionRow) => {
    setOptions((rows) => rows.filter((r) => r.key !== row.key));
    if (row.id) setRemovedIds((ids) => [...ids, row.id!]);
  };

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
    });
    try {
      if (isEdit) {
        await update.mutateAsync({ id: service!.id, input: serviceFields });
        for (const o of options) {
          if (o.id) await updateVariant.mutateAsync({ variantId: o.id, input: toInput(o) });
          else await addVariant.mutateAsync({ serviceId: service!.id, input: toInput(o) });
        }
        for (const id of removedIds) await deactivateVariant.mutateAsync(id);
        toast.success('Service updated', serviceFields.name);
      } else {
        await create.mutateAsync({ ...serviceFields, variants: options.map(toInput) });
        toast.success('Service created', serviceFields.name);
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
      title={isEdit ? 'Edit Service' : 'Add Service'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving} icon="check">
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Service name" required error={errors.name}>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} invalid={!!errors.name} placeholder="Printing — Black & White" />
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
              <div key={o.key} className="flex items-center gap-2">
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
            ))}
          </div>
        </div>

        <Field label="Status">
          <Select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as 'ACTIVE' | 'INACTIVE' }))}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </Select>
        </Field>
      </form>
    </Modal>
  );
}
