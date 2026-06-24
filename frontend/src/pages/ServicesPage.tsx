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
  useCreateService,
  useDeleteService,
  useReactivateService,
  useRemoveService,
  useServices,
  useUpdateService,
  type ServiceInput,
} from '@/hooks/useCatalog';
import { PRICING_TYPE_OPTIONS, SERVICE_TYPE_ICON, SERVICE_TYPE_OPTIONS } from '@/lib/constants';
import { extractMessage } from '@/lib/api';
import { currency, humanize, num } from '@/lib/utils';
import type { PricingType, Service, ServiceType } from '@/types';

export default function ServicesPage() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [deleting, setDeleting] = useState<Service | null>(null);
  const [removing, setRemoving] = useState<Service | null>(null);

  const { data, isLoading, isError, refetch, error } = useServices({
    search: search || undefined,
    limit: 100,
    includeInactive: isAdmin,
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
          isAdmin && (
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
            action={isAdmin && <Button icon="add" onClick={() => setFormOpen(true)}>Add Service</Button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-gutter sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {services.map((s) => (
            <Card key={s.id} className="flex flex-col p-5">
              <div className="mb-4 flex items-start justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-fixed text-on-primary-fixed">
                  <Icon name={SERVICE_TYPE_ICON[s.type]} size={22} />
                </span>
                {isAdmin && (
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
              <p className="mt-0.5 text-[12px] text-on-surface-variant">{humanize(s.type)}</p>
              <div className="mt-4 flex items-end justify-between">
                <div>
                  <p className="font-mono-data text-h3 font-bold text-primary">{currency(s.unitPrice)}</p>
                  <p className="text-[11px] text-on-surface-variant">
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
  type: ServiceType;
  pricingType: PricingType;
  unitPrice: string;
  status: 'ACTIVE' | 'INACTIVE';
}

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
  const isEdit = !!service;
  const saving = create.isPending || update.isPending;

  const [form, setForm] = useState<ServiceFormState>({
    name: '',
    type: 'PRINTING_BW',
    pricingType: 'PER_PAGE',
    unitPrice: '',
    status: 'ACTIVE',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (service) {
      setForm({
        name: service.name,
        type: service.type,
        pricingType: service.pricingType,
        unitPrice: num(service.unitPrice).toString(),
        status: service.status,
      });
    } else {
      setForm({ name: '', type: 'PRINTING_BW', pricingType: 'PER_PAGE', unitPrice: '', status: 'ACTIVE' });
    }
  }, [open, service]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (form.unitPrice === '' || num(form.unitPrice) < 0) errs.unitPrice = 'Enter a valid price';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const input: ServiceInput = {
      name: form.name.trim(),
      type: form.type,
      pricingType: form.pricingType,
      unitPrice: num(form.unitPrice),
      status: form.status,
    };
    try {
      if (isEdit) {
        await update.mutateAsync({ id: service!.id, input });
        toast.success('Service updated', input.name);
      } else {
        await create.mutateAsync(input);
        toast.success('Service created', input.name);
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
        <Field label="Service type" required>
          <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as ServiceType }))}>
            {SERVICE_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
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
          <Field
            label={form.pricingType === 'PER_PAGE' ? 'Price per page' : 'Fixed price'}
            required
            error={errors.unitPrice}
          >
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.unitPrice}
              onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))}
              invalid={!!errors.unitPrice}
            />
          </Field>
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
