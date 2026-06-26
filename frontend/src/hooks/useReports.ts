import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { qk } from './keys';
import type {
  CashSession,
  ExpenseByCategory,
  FinancialSummary,
  LowStockRow,
  ProductMovementRow,
  ProductProfitRow,
  SalesSeriesPoint,
  StockLevelRow,
  TopProductRow,
  UserActivityRow,
} from '@/types';

const clean = (p: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== '' && v !== null));

export interface DateRange {
  from?: string;
  to?: string;
}

export function useFinancialSummary(range: DateRange, enabled = true) {
  return useQuery({
    queryKey: qk.report('financial-summary', range),
    enabled,
    queryFn: () =>
      unwrap<FinancialSummary>(api.get('/reports/financial-summary', { params: clean({ ...range }) })),
  });
}

export function useSalesSeries(
  range: DateRange & { granularity?: 'DAILY' | 'WEEKLY' | 'MONTHLY' },
  enabled = true,
) {
  return useQuery({
    queryKey: qk.report('sales-series', range),
    enabled,
    queryFn: () =>
      unwrap<SalesSeriesPoint[]>(api.get('/reports/sales', { params: clean({ ...range }) })),
  });
}

export function useExpensesByCategory(range: DateRange, enabled = true) {
  return useQuery({
    queryKey: qk.report('expenses-by-category', range),
    enabled,
    queryFn: () =>
      unwrap<ExpenseByCategory[]>(
        api.get('/reports/expenses-by-category', { params: clean({ ...range }) }),
      ),
  });
}

export function useStockLevels(enabled = true) {
  return useQuery({
    queryKey: qk.report('stock-levels'),
    enabled,
    queryFn: () => unwrap<StockLevelRow[]>(api.get('/reports/inventory/stock-levels')),
  });
}

export function useReportLowStock(enabled = true) {
  return useQuery({
    queryKey: qk.report('low-stock'),
    enabled,
    queryFn: () => unwrap<LowStockRow[]>(api.get('/reports/inventory/low-stock')),
  });
}

export function useTopProducts(range: DateRange, enabled = true) {
  return useQuery({
    queryKey: qk.report('top-products', range),
    enabled,
    queryFn: () => unwrap<TopProductRow[]>(api.get('/reports/top-products', { params: clean({ ...range }) })),
  });
}

export function useProductProfitability(range: DateRange, enabled = true) {
  return useQuery({
    queryKey: qk.report('profitability', range),
    enabled,
    queryFn: () =>
      unwrap<ProductProfitRow[]>(api.get('/reports/profitability', { params: clean({ ...range }) })),
  });
}

export function useProductMovement(range: DateRange, enabled = true) {
  return useQuery({
    queryKey: qk.report('product-movement', range),
    enabled,
    queryFn: () =>
      unwrap<ProductMovementRow[]>(api.get('/reports/product-movement', { params: clean({ ...range }) })),
  });
}

export function useCashReport(enabled = true) {
  return useQuery({
    queryKey: qk.report('cash-sessions'),
    enabled,
    queryFn: () => unwrap<CashSession[]>(api.get('/reports/cash-sessions')),
  });
}

export function useUserActivityReport(range: DateRange, enabled = true) {
  return useQuery({
    queryKey: qk.report('user-activity', range),
    enabled,
    queryFn: () =>
      unwrap<UserActivityRow[]>(api.get('/reports/user-activity', { params: clean({ ...range }) })),
  });
}
