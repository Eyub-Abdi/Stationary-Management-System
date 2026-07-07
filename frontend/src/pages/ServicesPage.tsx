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
  SearchInput,
} from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import {
  useDeleteService,
  useReactivateService,
  useRemoveService,
  useServices,
} from '@/hooks/useCatalog';
import { DEFAULT_SERVICE_ICON } from '@/lib/constants';
import { extractMessage } from '@/lib/api';
import { currency, num } from '@/lib/utils';
import type { Service } from '@/types';

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
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
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
            <Button icon="add" onClick={() => navigate('/services/new')}>
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
            action={canManage && <Button icon="add" onClick={() => navigate('/services/new')}>Add Service</Button>}
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
                        onClick: () => navigate(`/services/${s.id}/edit`),
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
