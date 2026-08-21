import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { qk } from './keys';
import type {
  CashMovementType,
  CashSession,
  CashSessionStatus,
  Paginated,
  SortParams,
} from '@/types';

const clean = (p: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== '' && v !== null));

export function useCashSessions(
  filters: { page?: number; limit?: number; status?: CashSessionStatus } & SortParams,
) {
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

export function useCashVariances(filters: { page?: number; limit?: number } & SortParams) {
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

/**
 * The shop's one shared cash session (null when the till is closed). Polled so
 * a station notices when someone else opens or closes the till.
 */
export function useCurrentCashSession(enabled = true) {
  return useQuery({
    queryKey: qk.currentCashSession(),
    enabled,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    queryFn: () => unwrap<CashSession | null>(api.get('/cash-sessions/current')),
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
  /** What was left in the drawer: counted minus anything taken out at close. */
  amount: string;
  hasPrevious: boolean;
  from: string | null;
  counted: string;
  withdrawn: string;
}

/** The carry-over opening float (what the last shift left in the drawer). */
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash-sessions'] });
      qc.invalidateQueries({ queryKey: qk.currentCashSession() });
    },
  });
}

export function useCloseCashSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      actualAmount,
      withdrawal,
      withdrawalTo,
      notes,
    }: {
      id: string;
      actualAmount: number;
      withdrawal?: number;
      withdrawalTo?: 'BANK';
      notes?: string;
    }) =>
      unwrap<CashSession>(
        api.post(`/cash-sessions/${id}/close`, {
          actualAmount,
          withdrawal,
          withdrawalTo,
          notes,
        }),
      ),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ['cash-sessions'] });
      qc.invalidateQueries({ queryKey: qk.cashSession(id) });
      qc.invalidateQueries({ queryKey: qk.currentCashSession() });
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
      qc.invalidateQueries({ queryKey: qk.currentCashSession() });
    },
  });
}
