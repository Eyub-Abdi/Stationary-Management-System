import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { qk } from './keys';
import type {
  InventoryMovement,
  InventoryMovementType,
  Paginated,
  SortParams,
  StockAdjustmentReason,
  StockLevelRow,
} from '@/types';

const clean = (p: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== '' && v !== null));

export interface MovementFilters extends SortParams {
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
  variantId: string;
  quantityChange: number;
  reasonCode: StockAdjustmentReason;
  /** Optional detail. The API falls back to the label of the reason. */
  reason?: string;
  unitCost?: number;
}

/** Stock spoiled during a job. Either through a service option's bill of
 *  materials (pages jammed while printing) or straight off a product. */
export interface RecordWastageInput {
  serviceVariantId?: string;
  variantId?: string;
  quantity: number;
  reasonCode: StockAdjustmentReason;
  notes?: string;
}

export interface WastageResult {
  totalCost: string;
  adjustments: { id: string; quantityChange: number }[];
}

export function useAdjustStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AdjustStockInput) => unwrap(api.post('/inventory/adjust', input)),
    onSuccess: () => invalidateStock(qc),
  });
}

export function useRecordWastage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordWastageInput) =>
      unwrap<WastageResult>(api.post('/inventory/wastage', input)),
    onSuccess: () => invalidateStock(qc),
  });
}

/** Stock moved, so anything derived from it is stale — including the reports
 *  that now carry the cost of the write-off into profit. */
function invalidateStock(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['inventory'] });
  qc.invalidateQueries({ queryKey: ['products'] });
  qc.invalidateQueries({ queryKey: ['report'] });
  qc.invalidateQueries({ queryKey: ['accounting'] });
}
