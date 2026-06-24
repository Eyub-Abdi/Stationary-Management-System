import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Uploads an image to POST /uploads/image and returns its public URL. */
export function useUploadImage() {
  return useMutation({
    mutationFn: async (file: File): Promise<string> => {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post('/uploads/image', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = res.data?.data ?? res.data;
      return data.url as string;
    },
  });
}
