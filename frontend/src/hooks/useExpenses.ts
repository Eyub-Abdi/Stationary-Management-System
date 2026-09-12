import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { qk } from './keys';
import type {
  DailyTotalPoint,
  Expense,
  ExpensePayment,
  OfficePurchasesOutstanding,
  Paginated,
  PaymentMethod,
  PaymentSource,
  SortParams,
} from '@/types';

const clean = (p: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== '' && v !== null));

export interface ExpenseFilters extends SortParams {
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
  /** TILL needs an open session; HELD_CASH spends the cash held at the shop. */
  paidFrom?: PaymentSource;
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
      // Paid from held cash, the money moves on the Bank page instead.
      qc.invalidateQueries({ queryKey: ['hand'] });
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
      // Paid from held cash, the money moves on the Bank page instead.
      qc.invalidateQueries({ queryKey: ['hand'] });
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
      // Paid from held cash, the money moves on the Bank page instead.
      qc.invalidateQueries({ queryKey: ['hand'] });
    },
  });
}

// --- Office / internal-use purchases (itemized expenses) --------------------

export interface OfficePurchaseFilters extends SortParams {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
  /** UNPAID is the working list: what still has to be settled with a vendor. */
  settlement?: 'UNPAID' | 'PAID';
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
  /** CASH pays out of the till now; CREDIT leaves it owed to the vendor. */
  paymentMethod?: PaymentMethod;
  /** Part-payment handed over now, on a CREDIT purchase. */
  amountPaid?: number;
  /** Which pot pays for it. Ignored when nothing is paid now. */
  paidFrom?: PaymentSource;
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

/** What the shop still owes vendors — the payable side of office purchases. */
export function useOfficePurchasesOutstanding() {
  return useQuery({
    queryKey: qk.officePurchasesOutstanding(),
    queryFn: () =>
      unwrap<OfficePurchasesOutstanding>(api.get('/expenses/office/outstanding')),
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
      // Paid from held cash, the money moves on the Bank page instead.
      qc.invalidateQueries({ queryKey: ['hand'] });
    },
  });
}

/**
 * Pays down an office purchase bought on credit. The cash leaves today's till,
 * so the open session has to be refreshed alongside the purchase itself.
 */
export function usePayOfficePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      amount,
      notes,
      paidFrom,
    }: {
      id: string;
      amount: number;
      notes?: string;
      paidFrom?: PaymentSource;
    }) =>
      unwrap<{ payment: ExpensePayment; amountPaid: string; amountDue: string }>(
        api.post(`/expenses/office/${id}/payments`, clean({ amount, notes, paidFrom }), {
          headers: { 'Idempotency-Key': crypto.randomUUID() },
        }),
      ),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ['office-purchases'] });
      qc.invalidateQueries({ queryKey: qk.officePurchase(id) });
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['cash-session'] });
      qc.invalidateQueries({ queryKey: ['hand'] });
      qc.invalidateQueries({ queryKey: qk.moneyPosition() });
    },
  });
}
