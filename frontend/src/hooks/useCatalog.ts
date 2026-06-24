import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { qk } from './keys';
import type {
  Category,
  Paginated,
  PricingType,
  Service,
  ServiceStatus,
  ServiceType,
  Supplier,
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
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.categories() }),
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.categories() }),
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

export interface ServiceInput {
  name: string;
  type: ServiceType;
  pricingType: PricingType;
  unitPrice: number;
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

export function useCreateService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ServiceInput) => unwrap<Service>(api.post('/services', input)),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}
