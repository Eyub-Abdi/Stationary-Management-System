import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

/** What a dump contains, read by the server without restoring it. */
export interface DumpInspection {
  migrations: string[];
  latestMigration: string | null;
  /** Database changes this build has that the backup predates. */
  missingMigrations: string[];
  /** True when restoring would roll the schema back. */
  isBehind: boolean;
  tableCount: number;
}

export interface BackupFileInfo {
  filename: string;
  path: string;
  sizeBytes: number;
  /** Real local time the file was written (not the UTC name). */
  takenAt: string;
  inspection: DumpInspection | null;
  error?: string;
}

/** Dumps sitting in the configured backup folder, newest first. */
export function useBackupFiles() {
  return useQuery({
    queryKey: ['backup-files'],
    queryFn: () =>
      unwrap<{ dir: string; files: BackupFileInfo[] }>(api.get('/admin/backups')),
  });
}

export interface RestoreResult {
  ok: boolean;
  restoredFrom: string;
  restartRequired?: boolean;
  rolledBack?: boolean;
  migrationsApplied?: number;
  /** Data restored, but bringing the schema up to date failed — needs a hand. */
  migrationError?: string;
}

/** Restores a dump already on disk, chosen by filename. */
export function useRestoreLocalBackup() {
  return useMutation({
    mutationFn: (input: { filename: string; acknowledgeOlder?: boolean }) =>
      unwrap<RestoreResult>(api.post('/admin/restore/local', input, { timeout: 0 })),
  });
}

/** Uploads a .dump and replaces the entire database with it. Destructive. */
export function useRestoreBackup() {
  return useMutation({
    mutationFn: async ({
      file,
      acknowledgeOlder,
    }: {
      file: File;
      acknowledgeOlder?: boolean;
    }) => {
      const form = new FormData();
      form.append('file', file);
      if (acknowledgeOlder) form.append('acknowledgeOlder', 'true');
      const res = await api.post('/admin/restore', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 0, // restores can take a while; do not time out
      });
      return (res.data?.data ?? res.data) as RestoreResult;
    },
  });
}
