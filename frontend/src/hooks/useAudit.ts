import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { qk } from './keys';
import type { AuditLog, Paginated } from '@/types';

const clean = (p: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== '' && v !== null));

export interface AuditFilters {
  page?: number;
  limit?: number;
  userId?: string;
  action?: string;
  entityType?: string;
}

export function useAuditLogs(filters: AuditFilters) {
  return useQuery({
    queryKey: qk.audit(filters),
    queryFn: async () => {
      const res = await api.get<Paginated<AuditLog>>('/audit-logs', { params: clean({ ...filters }) });
      return res.data;
    },
  });
}
