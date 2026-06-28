import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { qk } from './keys';
import type { Expense, ExpenseCategory, Paginated } from '@/types';

const clean = (p: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== '' && v !== null));

export interface ExpenseFilters {
  page?: number;
  limit?: number;
  search?: string;
  category?: ExpenseCategory;
  from?: string;
  to?: string;
}

export interface CreateExpenseInput {
  category: ExpenseCategory;
  amount: number;
  expenseDate: string;
  description?: string;
}

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
