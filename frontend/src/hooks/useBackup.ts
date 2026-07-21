import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';

export interface LocalBackupResult {
  dir: string;
  filename: string;
  path: string;
  sizeBytes: number;
}

/** Writes a backup to the configured on-disk folder (drive D by default). */
export function useRunLocalBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap<LocalBackupResult>(api.post('/admin/backup/local', {})),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['app-settings'] }),
  });
}

/** Uploads a .dump and replaces the entire database with it. Destructive. */
export function useRestoreBackup() {
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post('/admin/restore', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 0, // restores can take a while; do not time out
      });
      return (res.data?.data ?? res.data) as {
        ok: boolean;
        restoredFrom: string;
        /** The session was issued against the previous database — sign in again. */
        restartRequired?: boolean;
      };
    },
  });
}
