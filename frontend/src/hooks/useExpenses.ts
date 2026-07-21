import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { qk } from './keys';
import type { DailyTotalPoint, Expense, Paginated } from '@/types';

const clean = (p: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== '' && v !== null));

export interface ExpenseFilters {
  page?: number;
  limit?: number;
  search?: string;
  categoryId?: string;
  from?: string;
  to?: string;
}

export interface CreateExpenseInput {
  categoryId: string;
  amount: number;
  expenseDate: string;
  description?: string;
}

export type UpdateExpenseInput = Partial<CreateExpenseInput>;

export function useExpenses(filters: ExpenseFilters, enabled = true) {
  return useQuery({
    queryKey: qk.expenses(filters),
    enabled,
    queryFn: async () => {
      const res = await api.get<Paginated<Expense>>('/expenses', { params: clean({ ...filters }) });
      return res.data;
    },
  });
}

export function useExpensesDaily(range: { from?: string; to?: string }, enabled = true) {
  return useQuery({
    queryKey: qk.expensesDaily(range),
    enabled,
    queryFn: () =>
      unwrap<DailyTotalPoint[]>(api.get('/expenses/daily', { params: clean({ ...range }) })),
  });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExpenseInput) => unwrap<Expense>(api.post('/expenses', input)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['report'] });
      qc.invalidateQueries({ queryKey: ['cash-session'] });
    },
  });
}

export function useUpdateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateExpenseInput }) =>
      unwrap<Expense>(api.patch(`/expenses/${id}`, input)),
    // An edited amount changes the till's expected cash and the P&L.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['report'] });
      qc.invalidateQueries({ queryKey: ['cash-session'] });
    },
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/expenses/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['office-purchases'] });
      qc.invalidateQueries({ queryKey: ['report'] });
      qc.invalidateQueries({ queryKey: ['cash-session'] });
    },
  });
}

// --- Office / internal-use purchases (itemized expenses) --------------------

export interface OfficePurchaseFilters {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
}

export interface OfficePurchaseItemInput {
  name: string;
  quantity: number;
  unitCost: number;
}

export interface CreateOfficePurchaseInput {
  purchaseDate: string;
  supplierName?: string;
  description?: string;
  items: OfficePurchaseItemInput[];
}

export function useOfficePurchases(filters: OfficePurchaseFilters) {
  return useQuery({
    queryKey: qk.officePurchases(filters),
    queryFn: async () => {
      const res = await api.get<Paginated<Expense>>('/expenses/office', {
        params: clean({ ...filters }),
      });
      return res.data;
    },
  });
}

export function useOfficePurchase(id: string | undefined) {
  return useQuery({
    queryKey: qk.officePurchase(id ?? ''),
    enabled: !!id,
    queryFn: async () => unwrap<Expense>(api.get(`/expenses/office/${id}`)),
  });
}

export function useCreateOfficePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOfficePurchaseInput) =>
      unwrap<Expense>(api.post('/expenses/office', input)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['office-purchases'] });
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['report'] });
      qc.invalidateQueries({ queryKey: ['cash-session'] });
    },
  });
}
