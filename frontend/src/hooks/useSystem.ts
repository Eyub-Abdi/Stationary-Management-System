import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';

export interface StartupStatus {
  supported: boolean;
  installed: boolean;
  enabled: boolean;
  platform: string;
  productionReady: boolean;
  url: string;
  serviceName: string;
}

export function useStartupStatus() {
  return useQuery({
    queryKey: ['system', 'startup'],
    queryFn: () => unwrap<StartupStatus>(api.get('/admin/system/startup')),
  });
}

export function useSetStartup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) =>
      unwrap<StartupStatus>(api.post('/admin/system/startup', { enabled })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['system', 'startup'] }),
  });
}
