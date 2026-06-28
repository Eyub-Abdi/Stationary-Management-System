import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';

/**
 * Creates a backup on the server and downloads the .dump to the browser. The
 * owner keeps these files off-server (USB / cloud) — that copy is the backup.
 */
export function useDownloadBackup() {
  return useMutation({
    mutationFn: async () => {
      // Send {} (not null): the API's JSON body-parser runs in strict mode and
      // rejects a primitive `null` body with a 400.
      const res = await api.post('/admin/backup', {}, { responseType: 'blob' });
      const blob = res.data as Blob;
      const cd = (res.headers['content-disposition'] as string | undefined) ?? '';
      const filename = /filename="?([^"]+)"?/.exec(cd)?.[1] ?? 'kj_backup.dump';

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return filename;
    },
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
      return (res.data?.data ?? res.data) as { ok: boolean; restoredFrom: string };
    },
  });
}
