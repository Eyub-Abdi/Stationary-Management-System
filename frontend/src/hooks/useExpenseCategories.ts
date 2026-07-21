import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { qk } from './keys';
import type { ExpenseCategory } from '@/types';

export interface ExpenseCategoryInput {
  name?: string;
  icon?: string;
  staffAllowed?: boolean;
  sortOrder?: number;
  isActive?: boolean;
}

/** Admins get every category (archived included, with usage counts); staff get
 *  only the active petty-cash ones they may record against. */
export function useExpenseCategories() {
  return useQuery({
    queryKey: qk.expenseCategories(),
    queryFn: () => unwrap<ExpenseCategory[]>(api.get('/expense-categories')),
    staleTime: 5 * 60_000,
  });
}

export function useCreateExpenseCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ExpenseCategoryInput & { name: string }) =>
      unwrap<ExpenseCategory>(api.post('/expense-categories', input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.expenseCategories() }),
  });
}

export function useUpdateExpenseCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ExpenseCategoryInput }) =>
      unwrap<ExpenseCategory>(api.patch(`/expense-categories/${id}`, input)),
    // Expenses and reports embed the category name and icon.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.expenseCategories() });
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['report'] });
    },
  });
}

export function useDeleteExpenseCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/expense-categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.expenseCategories() }),
  });
}
