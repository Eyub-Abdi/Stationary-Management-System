import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { qk } from './keys';
import type {
  DailyTotalPoint,
  Paginated,
  PaymentMethod,
  Purchase,
  SellUnit,
  SortParams,
} from '@/types';

const clean = (p: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== '' && v !== null));

export interface PurchaseItemInput {
  variantId: string;
  sellUnit?: SellUnit;
  quantity: number;
  /** Pieces per pack for this delivery (when received as a pack). */
  unitSize?: number;
  /** Pack name for this delivery, e.g. "Box" (when received as a pack). */
  unitLabel?: string;
  unitCost: number;
  /** New selling price per base unit; updates the variant's price tag. */
  sellingPrice?: number;
  /** New wholesale price per piece; updates the variant's wholesale tag. */
  wholesalePrice?: number;
}

export interface CreatePurchaseInput {
  supplierId?: string;
  purchaseDate: string;
  paymentMethod?: PaymentMethod;
  amountPaid?: number;
  notes?: string;
  items: PurchaseItemInput[];
}

export interface PurchaseFilters extends SortParams {
  page?: number;
  limit?: number;
  search?: string;
  from?: string;
  to?: string;
}

export function usePurchases(filters: PurchaseFilters = {}) {
  return useQuery({
    queryKey: qk.purchases(filters),
    queryFn: async () => {
      const res = await api.get<Paginated<Purchase>>('/purchases', { params: clean({ ...filters }) });
      return res.data;
    },
  });
}

export function usePurchasesDaily(range: { from?: string; to?: string }, enabled = true) {
  return useQuery({
    queryKey: qk.purchasesDaily(range),
    enabled,
    queryFn: () =>
      unwrap<DailyTotalPoint[]>(api.get('/purchases/daily', { params: clean({ ...range }) })),
  });
}

/** Undoes a purchase: stock off the shelf, batches gone, supplier debt and till
 *  cash unwound. The API refuses once anything has been sold out of it. */
export function useVoidPurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      unwrap(api.post(`/purchases/${id}/void`, { reason })),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: qk.purchase(id) });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      qc.invalidateQueries({ queryKey: ['cash'] });
      qc.invalidateQueries({ queryKey: ['report'] });
      qc.invalidateQueries({ queryKey: ['accounting'] });
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
