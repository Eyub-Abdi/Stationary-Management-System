import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { qk } from './keys';
import type {
  CashMovementType,
  CashSession,
  CashSessionStatus,
  Paginated,
} from '@/types';

const clean = (p: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== '' && v !== null));

export function useCashSessions(filters: { page?: number; limit?: number; status?: CashSessionStatus }) {
  return useQuery({
    queryKey: qk.cashSessions(filters),
    queryFn: async () => {
      const res = await api.get<Paginated<CashSession>>('/cash-sessions', {
        params: clean({ ...filters }),
      });
      return res.data;
    },
  });
}

export function useCashVariances(filters: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: qk.cashVariances(filters),
    queryFn: async () => {
      const res = await api.get<Paginated<CashSession>>('/cash-sessions/variances', {
        params: clean({ ...filters }),
      });
      return res.data;
    },
  });
}

export function useCashSessionSummary(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.cashSession(id ?? ''),
    enabled: !!id,
    refetchInterval: id ? 30_000 : false,
    queryFn: () => unwrap<CashSession>(api.get(`/cash-sessions/${id}`)),
  });
}

export interface SuggestedFloat {
  amount: string;
  hasPrevious: boolean;
  from: string | null;
}

/** The carry-over opening float (last shift's counted closing cash). */
export function useSuggestedOpeningFloat(enabled = true) {
  return useQuery({
    queryKey: qk.openingFloat(),
    enabled,
    staleTime: 0,
    queryFn: () => unwrap<SuggestedFloat>(api.get('/cash-sessions/opening-float')),
  });
}

export function useOpenCashSession() {
  const qc = useQueryClient();
  return useMutation({
    // Omit openingBalance to let the server carry over the previous closing count.
    mutationFn: (openingBalance?: number) =>
      unwrap<CashSession>(
        api.post('/cash-sessions/open', clean({ openingBalance })),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cash-sessions'] }),
  });
}

export function useCloseCashSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, actualAmount, notes }: { id: string; actualAmount: number; notes?: string }) =>
      unwrap<CashSession>(api.post(`/cash-sessions/${id}/close`, { actualAmount, notes })),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ['cash-sessions'] });
      qc.invalidateQueries({ queryKey: qk.cashSession(id) });
    },
  });
}

export function useCashMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      type,
      amount,
      notes,
    }: {
      id: string;
      type: CashMovementType;
      amount: number;
      notes?: string;
    }) => unwrap(api.post(`/cash-sessions/${id}/movements`, { type, amount, notes })),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: qk.cashSession(id) });
      qc.invalidateQueries({ queryKey: ['cash-sessions'] });
    },
  });
}
