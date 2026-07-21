import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { qk } from './keys';
import type { AccountingPeriod, MonthlyStatement } from '@/types';

/** Every finished month with its figures and close status, newest first. */
export function useAccountingPeriods() {
  return useQuery({
    queryKey: qk.accountingPeriods(),
    queryFn: () => unwrap<AccountingPeriod[]>(api.get('/accounting/periods')),
  });
}

export function useMonthlyStatement(
  period: { year: number; month: number } | null,
) {
  return useQuery({
    queryKey: qk.monthlyStatement(period),
    enabled: !!period,
    queryFn: () =>
      unwrap<MonthlyStatement>(
        api.get('/accounting/periods/statement', { params: period! }),
      ),
  });
}

export function useClosePeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { year: number; month: number; notes?: string }) =>
      unwrap<AccountingPeriod>(api.post('/accounting/periods/close', input)),
    // Closing freezes entries, so anything showing them may now be read-only.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounting'] });
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['report'] });
    },
  });
}

export function useReopenPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ year, month, reason }: { year: number; month: number; reason: string }) =>
      unwrap<AccountingPeriod>(
        api.post(`/accounting/periods/${year}/${month}/reopen`, { reason }),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounting'] });
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['report'] });
    },
  });
}
