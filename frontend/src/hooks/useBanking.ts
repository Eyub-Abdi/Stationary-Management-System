import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { qk } from './keys';
import type {
  BankSummary,
  BankTransaction,
  Loan,
  LoanStatus,
  LoanSummary,
  MoneyLocation,
  MoneyPosition,
  Paginated,
} from '@/types';

const clean = (p: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== '' && v !== null));

/**
 * Money moving between the till, the bank and a member's pocket touches all
 * three views at once, so every mutation busts the lot rather than trying to
 * predict which figure changed.
 */
function useMoneyMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank'] });
      qc.invalidateQueries({ queryKey: ['loans'] });
      qc.invalidateQueries({ queryKey: ['loan'] });
      qc.invalidateQueries({ queryKey: ['cash-session'] });
      qc.invalidateQueries({ queryKey: qk.moneyPosition() });
    },
  });
}

// ---- Bank -------------------------------------------------------------------

export function useBankSummary(enabled = true) {
  return useQuery({
    queryKey: qk.bankSummary(),
    enabled,
    queryFn: () => unwrap<BankSummary>(api.get('/bank/summary')),
  });
}

export function useBankStatement(filters: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: qk.bankStatement(filters),
    queryFn: async () => {
      const res = await api.get<Paginated<BankTransaction>>('/bank/statement', {
        params: clean({ ...filters }),
      });
      return res.data;
    },
  });
}

export function useSetOpeningBalance() {
  return useMoneyMutation((body: { amount: number; notes?: string }) =>
    unwrap<BankTransaction>(api.post('/bank/opening-balance', body)),
  );
}

export function useTransferToBank() {
  return useMoneyMutation((body: { amount: number; notes?: string }) =>
    unwrap<BankTransaction>(api.post('/bank/transfer-to-bank', body)),
  );
}

export function useTransferToTill() {
  return useMoneyMutation((body: { amount: number; notes?: string }) =>
    unwrap<BankTransaction>(api.post('/bank/transfer-to-till', body)),
  );
}

export function useBankCorrection() {
  return useMoneyMutation((body: { amount: number; reason: string }) =>
    unwrap<BankTransaction>(api.post('/bank/correction', body)),
  );
}

// ---- Loans ------------------------------------------------------------------

export function useLoans(filters: {
  page?: number;
  limit?: number;
  status?: LoanStatus;
  userId?: string;
}) {
  return useQuery({
    queryKey: qk.loans(filters),
    queryFn: async () => {
      const res = await api.get<Paginated<Loan>>('/loans', { params: clean({ ...filters }) });
      return res.data;
    },
  });
}

export function useLoanSummary(enabled = true) {
  return useQuery({
    queryKey: qk.loanSummary(),
    enabled,
    queryFn: () => unwrap<LoanSummary>(api.get('/loans/summary')),
  });
}

export function useIssueLoan() {
  return useMoneyMutation(
    (body: {
      userId: string;
      amount: number;
      source: MoneyLocation;
      dueDate: string;
      notes?: string;
    }) => unwrap<Loan>(api.post('/loans', body)),
  );
}

export function useRepayLoan() {
  return useMoneyMutation(
    ({
      id,
      ...body
    }: {
      id: string;
      amount: number;
      destination: MoneyLocation;
      notes?: string;
    }) => unwrap<Loan>(api.post(`/loans/${id}/repayments`, body)),
  );
}

// ---- Position ---------------------------------------------------------------

export function useMoneyPosition(enabled = true) {
  return useQuery({
    queryKey: qk.moneyPosition(),
    enabled,
    queryFn: () => unwrap<MoneyPosition>(api.get('/reports/money-position')),
  });
}
