import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { qk } from './keys';
import type { AgingRow, Customer, CustomerPayment, Paginated } from '@/types';

const clean = (p: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== '' && v !== null));

export interface CustomerFilters {
  page?: number;
  limit?: number;
  search?: string;
  withBalance?: boolean;
}

export interface CustomerInput {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  creditLimit?: number | null;
  isActive?: boolean;
}

export function useCustomers(filters: CustomerFilters = {}) {
  return useQuery({
    queryKey: qk.customers(filters),
    queryFn: async () => {
      const res = await api.get<Paginated<Customer>>('/customers', { params: clean({ ...filters }) });
      return res.data;
    },
  });
}

export function useCustomer(id: string | undefined) {
  return useQuery({
    queryKey: qk.customer(id ?? ''),
    enabled: !!id,
    queryFn: () => unwrap<Customer>(api.get(`/customers/${id}`)),
  });
}

export function useCustomerAging() {
  return useQuery({
    queryKey: qk.customerAging(),
    queryFn: () => unwrap<AgingRow[]>(api.get('/customers/aging')),
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CustomerInput) => unwrap<Customer>(api.post('/customers', input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CustomerInput> }) =>
      unwrap<Customer>(api.patch(`/customers/${id}`, input)),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: qk.customer(id) });
    },
  });
}

export function useRecordCustomerPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      amount,
      saleId,
      notes,
    }: {
      id: string;
      amount: number;
      saleId?: string;
      notes?: string;
    }) =>
      unwrap<{ payment: CustomerPayment; balance: string }>(
        api.post(`/customers/${id}/payments`, clean({ amount, saleId, notes }), {
          headers: { 'Idempotency-Key': crypto.randomUUID() },
        }),
      ),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: qk.customer(id) });
      qc.invalidateQueries({ queryKey: ['cash-session'] });
    },
  });
}
