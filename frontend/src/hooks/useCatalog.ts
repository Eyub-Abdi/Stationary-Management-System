import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { qk } from './keys';
import type {
  Category,
  Paginated,
  PricingType,
  Service,
  ServiceStatus,
  ServiceVariant,
  Supplier,
  Unit,
} from '@/types';

const clean = (p: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== '' && v !== null));

// ---- Categories -----------------------------------------------------------

export function useCategories() {
  return useQuery({
    queryKey: qk.categories(),
    queryFn: () => unwrap<Category[]>(api.get('/categories')),
    staleTime: 5 * 60_000,
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; description?: string }) =>
      unwrap<Category>(api.post('/categories', input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.categories() }),
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { name?: string; description?: string } }) =>
      unwrap<Category>(api.patch(`/categories/${id}`, input)),
    // Products embed the category name / link, so refresh them too.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.categories() });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/categories/${id}`),
    // Deleting un-categorizes referencing products (FK SET NULL).
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.categories() });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

// ---- Units (packaging/measure units, e.g. pcs, Box, Roll) ------------------

export function useUnits() {
  return useQuery({
    queryKey: qk.units(),
    queryFn: () => unwrap<Unit[]>(api.get('/units')),
    staleTime: 5 * 60_000,
  });
}

export function useCreateUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string }) => unwrap<Unit>(api.post('/units', input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.units() }),
  });
}

export function useUpdateUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { name: string } }) =>
      unwrap<Unit>(api.patch(`/units/${id}`, input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.units() }),
  });
}

export function useDeleteUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/units/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.units() }),
  });
}

// ---- Services -------------------------------------------------------------

export interface ServiceFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: ServiceStatus;
  includeInactive?: boolean;
}

/** One bill-of-materials line: a product the option consumes. */
export interface ServiceComponentInput {
  variantId: string;
  /** Whole base units consumed per page (perPage) or per job. */
  qty?: number;
  perPage?: boolean;
}

export interface ServiceVariantInput {
  label: string;
  unitPrice: number;
  status?: ServiceStatus;
  /** Products this option consumes (its bill of materials). Empty = none. */
  components?: ServiceComponentInput[];
}

/** Service-level fields (the priced options live in variants). */
export interface ServiceInput {
  name: string;
  icon?: string | null;
  pricingType: PricingType;
  status?: ServiceStatus;
}

export function useServices(filters: ServiceFilters = {}) {
  return useQuery({
    queryKey: qk.services(filters),
    queryFn: async () => {
      const res = await api.get<Paginated<Service>>('/services', { params: clean({ ...filters }) });
      return res.data;
    },
  });
}

export function useService(id?: string) {
  return useQuery({
    queryKey: qk.service(id ?? ''),
    queryFn: () => unwrap<Service>(api.get(`/services/${id}`)),
    enabled: !!id,
  });
}

export function useCreateService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ServiceInput & { variants: ServiceVariantInput[] }) =>
      unwrap<Service>(api.post('/services', input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  });
}

export function useUpdateService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<ServiceInput> }) =>
      unwrap<Service>(api.patch(`/services/${id}`, input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  });
}

export function useAddServiceVariant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ serviceId, input }: { serviceId: string; input: ServiceVariantInput }) =>
      unwrap<ServiceVariant>(api.post(`/services/${serviceId}/variants`, input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  });
}

export function useUpdateServiceVariant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ variantId, input }: { variantId: string; input: Partial<ServiceVariantInput> }) =>
      unwrap<ServiceVariant>(api.patch(`/services/variants/${variantId}`, input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  });
}

export function useDeactivateServiceVariant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (variantId: string) =>
      unwrap<ServiceVariant>(api.delete(`/services/variants/${variantId}`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  });
}

export function useDeleteService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/services/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  });
}

export function useReactivateService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap<Service>(api.patch(`/services/${id}/reactivate`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  });
}

export function useRemoveService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/services/${id}/permanent`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  });
}

// ---- Suppliers ------------------------------------------------------------

export interface SupplierInput {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  isActive?: boolean;
}

export function useSuppliers(
  filters: { page?: number; limit?: number; search?: string; withBalance?: boolean } = {},
) {
  return useQuery({
    queryKey: qk.suppliers(filters),
    queryFn: async () => {
      const res = await api.get<Paginated<Supplier>>('/suppliers', { params: clean({ ...filters }) });
      return res.data;
    },
  });
}

export interface SupplierSummary {
  totalPayable: string;
  largestDebt: string;
  weOweCount: number;
  supplierCount: number;
}

export function useSupplierSummary() {
  return useQuery({
    queryKey: qk.supplierSummary(),
    queryFn: () => unwrap<SupplierSummary>(api.get('/suppliers/summary')),
    staleTime: 30_000,
  });
}

export function useSupplier(id: string | undefined) {
  return useQuery({
    queryKey: qk.supplier(id ?? ''),
    enabled: !!id,
    queryFn: () => unwrap<Supplier>(api.get(`/suppliers/${id}`)),
  });
}

export function useRecordSupplierPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      amount,
      purchaseId,
      notes,
    }: {
      id: string;
      amount: number;
      purchaseId?: string;
      notes?: string;
    }) =>
      unwrap(
        api.post(`/suppliers/${id}/payments`, clean({ amount, purchaseId, notes }), {
          headers: { 'Idempotency-Key': crypto.randomUUID() },
        }),
      ),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      qc.invalidateQueries({ queryKey: qk.supplier(id) });
      qc.invalidateQueries({ queryKey: ['cash-session'] });
    },
  });
}

export function useCreateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SupplierInput) => unwrap<Supplier>(api.post('/suppliers', input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}

export function useUpdateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<SupplierInput> }) =>
      unwrap<Supplier>(api.patch(`/suppliers/${id}`, input)),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      qc.invalidateQueries({ queryKey: qk.supplier(id) });
    },
  });
}
