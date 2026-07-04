import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { qk } from './keys';
import type { Paginated, Role, User } from '@/types';

const clean = (p: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== '' && v !== null));

export function useUsers(filters: { page?: number; limit?: number; search?: string } = {}) {
  return useQuery({
    queryKey: qk.users(filters),
    queryFn: async () => {
      const res = await api.get<Paginated<User>>('/users', { params: clean({ ...filters }) });
      return res.data;
    },
  });
}

export function useUser(id: string | undefined) {
  return useQuery({
    queryKey: qk.user(id ?? ''),
    enabled: !!id,
    queryFn: () => unwrap<User>(api.get(`/users/${id}`)),
  });
}

export interface CreateUserInput {
  email: string;
  fullName: string;
  password: string;
  role: Role;
  permissions?: string[];
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) => unwrap<User>(api.post('/users', input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: {
        fullName?: string;
        email?: string;
        role?: Role;
        isActive?: boolean;
        permissions?: string[];
      };
    }) => unwrap<User>(api.patch(`/users/${id}`, input)),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: qk.user(id) });
    },
  });
}

export function useToggleUserActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      unwrap<User>(api.patch(`/users/${id}/${active ? 'activate' : 'deactivate'}`)),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: qk.user(id) });
    },
  });
}

/** Permanently deletes a user (only allowed when they have no activity history). */
export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useSetUserPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      unwrap(api.patch(`/users/${id}/password`, { newPassword: password })),
  });
}
