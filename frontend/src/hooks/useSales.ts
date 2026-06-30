import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { qk } from './keys';
import type { Paginated, PaymentMethod, Sale, SaleItemType, SaleStatus, SellUnit } from '@/types';

const clean = (p: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== '' && v !== null));

export interface SaleFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: SaleStatus;
  paymentMethod?: PaymentMethod;
  userId?: string;
  customerId?: string;
  from?: string;
  to?: string;
}

export interface SaleItemInput {
  itemType: SaleItemType;
  variantId?: string;
  serviceVariantId?: string;
  sellUnit?: SellUnit;
  quantity: number;
  pages?: number;
  discount?: number;
}

export interface CreateSaleInput {
  cashSessionId: string;
  items: SaleItemInput[];
  paymentMethod?: PaymentMethod;
  customerId?: string;
  cashReceived: number;
  orderDiscount?: number;
  notes?: string;
}

export function useSales(filters: SaleFilters) {
  return useQuery({
    queryKey: qk.sales(filters),
    queryFn: async () => {
      const res = await api.get<Paginated<Sale>>('/sales', { params: clean({ ...filters }) });
      return res.data;
    },
  });
}

export function useSale(id: string | undefined) {
  return useQuery({
    queryKey: qk.sale(id ?? ''),
    enabled: !!id,
    queryFn: () => unwrap<Sale>(api.get(`/sales/${id}`)),
  });
}

export function useCreateSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ input, idempotencyKey }: { input: CreateSaleInput; idempotencyKey?: string }) =>
      unwrap<Sale>(
        api.post('/sales', input, {
          headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
        }),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['report'] });
      qc.invalidateQueries({ queryKey: ['cash-session'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}

export interface SaleReturnResult {
  id: string;
  returnNumber: string;
  totalRefund: string;
  creditApplied: string;
}

export function useReturnSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      cashSessionId,
      items,
      reason,
    }: {
      id: string;
      cashSessionId: string;
      items: { saleItemId: string; quantity: number }[];
      reason: string;
    }) => unwrap<SaleReturnResult>(api.post(`/sales/${id}/returns`, { cashSessionId, items, reason })),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: qk.sale(id) });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['cash-session'] });
    },
  });
}

export function useVoidSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      unwrap(api.post(`/sales/${id}/void`, { reason })),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: qk.sale(id) });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
