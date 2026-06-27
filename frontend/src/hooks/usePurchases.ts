import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { qk } from './keys';
import type { Paginated, PaymentMethod, Purchase, SellUnit } from '@/types';

const clean = (p: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== '' && v !== null));

export interface PurchaseItemInput {
  variantId: string;
  sellUnit?: SellUnit;
  quantity: number;
  unitCost: number;
}

export interface CreatePurchaseInput {
  supplierId?: string;
  purchaseDate: string;
  paymentMethod?: PaymentMethod;
  amountPaid?: number;
  notes?: string;
  items: PurchaseItemInput[];
}

export function usePurchases(filters: { page?: number; limit?: number; search?: string } = {}) {
  return useQuery({
    queryKey: qk.purchases(filters),
    queryFn: async () => {
      const res = await api.get<Paginated<Purchase>>('/purchases', { params: clean({ ...filters }) });
      return res.data;
    },
  });
}

export function usePurchase(id: string | undefined) {
  return useQuery({
    queryKey: qk.purchase(id ?? ''),
    enabled: !!id,
    queryFn: () => unwrap<Purchase>(api.get(`/purchases/${id}`)),
  });
}

export function useCreatePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePurchaseInput) =>
      unwrap<Purchase>(
        api.post('/purchases', input, { headers: { 'Idempotency-Key': crypto.randomUUID() } }),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['suppliers'] });
    },
  });
}
