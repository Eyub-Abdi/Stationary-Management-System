import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Badge,
  Breadcrumbs,
  Button,
  Card,
  ConfirmDialog,
  Dropdown,
  ErrorState,
  Icon,
  LoadingState,
  PageHeader,
} from '@/components/ui';
import { UserFormModal, PasswordModal } from '@/features/users/UserModals';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { useDeleteUser, useToggleUserActive, useUser } from '@/hooks/useUsers';
import { PERMISSION_OPTIONS } from '@/lib/permissions';
import { extractMessage } from '@/lib/api';
import { formatDateTime, initials } from '@/lib/utils';

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: me } = useAuth();
  const toast = useToast();
  const { data, isLoading, isError, error, refetch } = useUser(id);
  const toggleActive = useToggleUserActive();
  const del = useDeleteUser();

  const [editOpen, setEditOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const isSelf = data?.id === me?.id;
  const isAdmin = data?.role === 'ADMIN';

  const confirmToggle = async () => {
    if (!data) return;
    try {
      await toggleActive.mutateAsync({ id: data.id, active: !data.isActive });
      toast.success(data.isActive ? 'User deactivated' : 'User activated', data.fullName);
      setToggleOpen(false);
    } catch (e) {
      toast.error('Failed', extractMessage(e));
    }
  };

  const confirmDelete = async () => {
    if (!data) return;
    try {
      await del.mutateAsync(data.id);
      toast.success('User deleted', `${data.fullName} was permanently removed.`);
      navigate('/users');
    } catch (e) {
      toast.error('Failed to delete', extractMessage(e));
    }
  };

  return (
    <div className="flex flex-col gap-gutter">
      <div>
        <Breadcrumbs
          className="mb-3"
          items={[
            { label: 'Home', to: '/' },
            { label: 'Users', to: '/users' },
            { label: data?.fullName ?? 'User' },
          ]}
        />
        <PageHeader
          title={data?.fullName ?? 'User'}
          description={data?.email ?? undefined}
          actions={
            data && (
              <div className="flex gap-2">
                <Button variant="outline" icon="edit" onClick={() => setEditOpen(true)}>
                  Edit
                </Button>
                <Dropdown
                  actions={[
                    { label: 'Reset password', icon: 'lock_reset', onClick: () => setPwOpen(true) },
                    {
                      label: data.isActive ? 'Deactivate' : 'Activate',
                      icon: data.isActive ? 'block' : 'check_circle',
                      danger: data.isActive,
                      disabled: isSelf,
                      onClick: () => setToggleOpen(true),
                    },
                    {
                      label: 'Delete user',
                      icon: 'delete',
                      danger: true,
                      disabled: isSelf,
                      onClick: () => setDeleteOpen(true),
                    },
                  ]}
                />
              </div>
            )
          }
        />
      </div>

      {isLoading ? (
        <LoadingState label="Loading user…" />
      ) : isError || !data ? (
        <ErrorState message={extractMessage(error)} onRetry={refetch} />
      ) : (
        <div className="flex flex-col gap-gutter">
          <Card className="flex flex-wrap items-center gap-4 p-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-h3 font-bold text-on-primary">
              {initials(data.fullName)}
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-h3 font-semibold text-on-surface">
                {data.fullName}
                {isSelf && <span className="text-[12px] font-normal text-on-surface-variant">(you)</span>}
              </p>
              <p className="truncate text-body-sm text-on-surface-variant">{data.email}</p>
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              <Badge tone={isAdmin ? 'navy' : 'neutral'}>{data.role}</Badge>
              <Badge tone={data.isActive ? 'success' : 'error'}>{data.isActive ? 'Active' : 'Inactive'}</Badge>
            </div>
          </Card>

          <Card className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
            <InfoItem icon="login" label="Last login" value={data.lastLoginAt ? formatDateTime(data.lastLoginAt) : 'Never'} />
            <InfoItem icon="event" label="Created" value={formatDateTime(data.createdAt)} />
            <InfoItem icon="badge" label="Role" value={isAdmin ? 'Administrator' : 'Staff'} />
          </Card>

          <div>
            <p className="mb-2 text-label-caps uppercase tracking-wide text-on-surface-variant">Permissions</p>
            {isAdmin ? (
              <div className="flex items-start gap-2 rounded-xl bg-surface-container-low p-4 text-body-sm text-on-surface-variant">
                <Icon name="verified_user" size={18} className="mt-0.5 shrink-0 text-primary" />
                <span>Administrators have full access to every part of the system.</span>
              </div>
            ) : (
              <Card className="p-4">
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {PERMISSION_OPTIONS.map((o) => {
                    const granted = (data.permissions ?? []).includes(o.key);
                    return (
                      <div
                        key={o.key}
                        className={granted ? 'flex items-start gap-2.5' : 'flex items-start gap-2.5 opacity-45'}
                      >
                        <Icon
                          name={granted ? 'check_circle' : 'remove_circle_outline'}
                          size={18}
                          className={granted ? 'mt-0.5 shrink-0 text-secondary' : 'mt-0.5 shrink-0 text-on-surface-variant'}
                        />
                        <div className="min-w-0">
                          <p className="text-body-sm font-medium text-on-surface">{o.label}</p>
                          <p className="text-[12px] text-on-surface-variant">{o.hint}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 text-[12px] text-on-surface-variant">
                  Staff can always sell at the POS and view the basics; the items above are extra management rights.
                </p>
              </Card>
            )}
          </div>
        </div>
      )}

      <UserFormModal open={editOpen} onClose={() => setEditOpen(false)} user={data ?? null} />
      <PasswordModal user={pwOpen ? data ?? null : null} onClose={() => setPwOpen(false)} />
      <ConfirmDialog
        open={toggleOpen}
        onClose={() => setToggleOpen(false)}
        onConfirm={confirmToggle}
        loading={toggleActive.isPending}
        tone={data?.isActive ? 'danger' : 'primary'}
        icon={data?.isActive ? 'block' : 'check_circle'}
        title={data?.isActive ? 'Deactivate user?' : 'Activate user?'}
        message={data?.isActive ? `${data?.fullName} will lose access immediately.` : `${data?.fullName} will regain access.`}
        confirmLabel={data?.isActive ? 'Deactivate' : 'Activate'}
      />
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={confirmDelete}
        loading={del.isPending}
        tone="danger"
        icon="delete"
        title="Delete user permanently?"
        message={`"${data?.fullName}" will be permanently deleted. This cannot be undone. Users with any activity (sales, payments, history) can't be deleted — deactivate them instead.`}
        confirmLabel="Delete"
      />
    </div>
  );
}

function InfoItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-container text-on-surface-variant">
        <Icon name={icon} size={18} />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-on-surface-variant">{label}</p>
        <p className="break-words text-body-sm font-medium text-on-surface">{value}</p>
      </div>
    </div>
  );
}
