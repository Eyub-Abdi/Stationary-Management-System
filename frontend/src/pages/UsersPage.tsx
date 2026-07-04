import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dropdown,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Pagination,
  SearchInput,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from '@/components/ui';
import { UserFormModal, PasswordModal } from '@/features/users/UserModals';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { useDeleteUser, useToggleUserActive, useUsers } from '@/hooks/useUsers';
import { extractMessage } from '@/lib/api';
import { formatDate, initials, timeAgo } from '@/lib/utils';
import type { User } from '@/types';

export default function UsersPage() {
  const navigate = useNavigate();
  const { user: me } = useAuth();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [pwUser, setPwUser] = useState<User | null>(null);
  const [toggle, setToggle] = useState<User | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);

  const { data, isLoading, isError, refetch, error } = useUsers({ page, limit: 12, search: search || undefined });
  const toggleActive = useToggleUserActive();
  const del = useDeleteUser();

  const confirmToggle = async () => {
    if (!toggle) return;
    try {
      await toggleActive.mutateAsync({ id: toggle.id, active: !toggle.isActive });
      toast.success(toggle.isActive ? 'User deactivated' : 'User activated', toggle.fullName);
      setToggle(null);
    } catch (e) {
      toast.error('Failed', extractMessage(e));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await del.mutateAsync(deleting.id);
      toast.success('User deleted', `${deleting.fullName} was permanently removed.`);
      setDeleting(null);
    } catch (e) {
      toast.error('Failed to delete', extractMessage(e));
    }
  };

  return (
    <div className="flex flex-col gap-gutter">
      <PageHeader
        title="Users"
        description="Manage staff accounts, roles, and access."
        actions={
          <Button icon="person_add" onClick={() => { setEditing(null); setFormOpen(true); }}>
            Add User
          </Button>
        }
      />

      <Card>
        <div className="border-b border-outline-variant p-4">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search by name or email…" className="max-w-md" />
        </div>

        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message={extractMessage(error)} onRetry={refetch} />
        ) : data!.data.length === 0 ? (
          <EmptyState icon="group" title="No users found" />
        ) : (
          <>
            <Table>
              <THead>
                <TH>User</TH>
                <TH align="center">Role</TH>
                <TH align="center">Status</TH>
                <TH>Last login</TH>
                <TH>Created</TH>
                <TH align="right">Actions</TH>
              </THead>
              <TBody>
                {data!.data.map((u) => (
                  <TR key={u.id} onClick={() => navigate(`/users/${u.id}`)}>
                    <TD>
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-[12px] font-bold text-on-primary">
                          {initials(u.fullName)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-on-surface">
                            {u.fullName}
                            {u.id === me?.id && <span className="ml-2 text-[11px] text-on-surface-variant">(you)</span>}
                          </p>
                          <p className="truncate text-[12px] text-on-surface-variant">{u.email}</p>
                        </div>
                      </div>
                    </TD>
                    <TD align="center"><Badge tone={u.role === 'ADMIN' ? 'navy' : 'neutral'}>{u.role}</Badge></TD>
                    <TD align="center"><Badge tone={u.isActive ? 'success' : 'error'}>{u.isActive ? 'Active' : 'Inactive'}</Badge></TD>
                    <TD className="text-on-surface-variant">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : 'Never'}</TD>
                    <TD className="text-on-surface-variant">{formatDate(u.createdAt)}</TD>
                    <TD align="right">
                      <div className="inline-flex" onClick={(e) => e.stopPropagation()}>
                      <Dropdown
                        actions={[
                          { label: 'Edit user', icon: 'edit', onClick: () => { setEditing(u); setFormOpen(true); } },
                          { label: 'Reset password', icon: 'lock_reset', onClick: () => setPwUser(u) },
                          {
                            label: u.isActive ? 'Deactivate' : 'Activate',
                            icon: u.isActive ? 'block' : 'check_circle',
                            danger: u.isActive,
                            disabled: u.id === me?.id,
                            onClick: () => setToggle(u),
                          },
                          {
                            label: 'Delete user',
                            icon: 'delete',
                            danger: true,
                            disabled: u.id === me?.id,
                            onClick: () => setDeleting(u),
                          },
                        ]}
                      />
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination meta={data!.meta} onPage={setPage} />
          </>
        )}
      </Card>

      <UserFormModal open={formOpen} onClose={() => setFormOpen(false)} user={editing} />
      <PasswordModal user={pwUser} onClose={() => setPwUser(null)} />
      <ConfirmDialog
        open={!!toggle}
        onClose={() => setToggle(null)}
        onConfirm={confirmToggle}
        loading={toggleActive.isPending}
        tone={toggle?.isActive ? 'danger' : 'primary'}
        icon={toggle?.isActive ? 'block' : 'check_circle'}
        title={toggle?.isActive ? 'Deactivate user?' : 'Activate user?'}
        message={toggle?.isActive ? `${toggle?.fullName} will lose access immediately.` : `${toggle?.fullName} will regain access.`}
        confirmLabel={toggle?.isActive ? 'Deactivate' : 'Activate'}
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={del.isPending}
        tone="danger"
        icon="delete"
        title="Delete user permanently?"
        message={`"${deleting?.fullName}" will be permanently deleted. This cannot be undone. Users with any activity (sales, payments, history) can't be deleted — deactivate them instead.`}
        confirmLabel="Delete"
      />
    </div>
  );
}
