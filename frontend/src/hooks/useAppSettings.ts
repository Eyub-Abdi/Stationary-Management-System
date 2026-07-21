import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';

export interface AppSettings {
  id: string;
  businessName: string;
  branchName: string;
  autoBackupEnabled: boolean;
  /** Local time of day (HH:mm) the daily backup runs. */
  backupTime: string;
  backupDir: string | null;
  /** How many backup files to keep; a new backup replaces the oldest. */
  backupKeep: number;
  lastBackupAt: string | null;
  lastBackupStatus: string | null;
  lastBackupPath: string | null;
  /** Folder backups actually go to (override or OS default). */
  effectiveBackupDir: string;
  defaultBackupDir: string;
  updatedAt: string;
}

export interface UpdateAppSettingsInput {
  businessName?: string;
  branchName?: string;
  autoBackupEnabled?: boolean;
  backupTime?: string;
  backupDir?: string;
  backupKeep?: number;
}

/** Shop branding (name, branch). Read by any signed-in user to render the UI. */
export function useAppSettings() {
  return useQuery({
    queryKey: ['app-settings'],
    queryFn: () => unwrap<AppSettings>(api.get('/settings')),
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateAppSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateAppSettingsInput) =>
      unwrap<AppSettings>(api.patch('/settings', input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['app-settings'] }),
  });
}
