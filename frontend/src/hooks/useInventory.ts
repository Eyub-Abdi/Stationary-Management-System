import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { qk } from './keys';
import type { InventoryMovement, InventoryMovementType, Paginated, StockLevelRow } from '@/types';

const clean = (p: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== '' && v !== null));

export interface MovementFilters {
  page?: number;
  limit?: number;
  productId?: string;
  type?: InventoryMovementType;
}

export function useMovements(filters: MovementFilters) {
  return useQuery({
    queryKey: qk.movements(filters),
    queryFn: async () => {
      const res = await api.get<Paginated<InventoryMovement>>('/inventory/movements', {
        params: clean({ ...filters }),
      });
      return res.data;
    },
  });
}

export function useValuation() {
  return useQuery({
    queryKey: qk.valuation(),
    queryFn: () => unwrap<StockLevelRow[]>(api.get('/inventory/valuation')),
  });
}

export interface AdjustStockInput {
  productId: string;
  quantityChange: number;
  reason: string;
  unitCost?: number;
}

export function useAdjustStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AdjustStockInput) => unwrap(api.post('/inventory/adjust', input)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
