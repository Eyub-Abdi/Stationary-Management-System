import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  Dropdown,
  EmptyState,
  ErrorState,
  Field,
  Icon,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import {
  useCreateUser,
  useDeleteUser,
  useSetUserPassword,
  useToggleUserActive,
  useUpdateUser,
  useUsers,
} from '@/hooks/useUsers';
import { ROLE_OPTIONS } from '@/lib/constants';
import { extractMessage } from '@/lib/api';
import { formatDate, initials, timeAgo } from '@/lib/utils';
import type { Role, User } from '@/types';

export default function UsersPage() {
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
                  <TR key={u.id}>
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

function UserFormModal({ open, onClose, user }: { open: boolean; onClose: () => void; user: User | null }) {
  const toast = useToast();
  const create = useCreateUser();
  const update = useUpdateUser();
  const isEdit = !!user;
  const saving = create.isPending || update.isPending;

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('STAFF');
  const [password, setPassword] = useState('');
  const [perms, setPerms] = useState({
    canManageProducts: false,
    canManageServices: false,
    canManagePurchases: false,
    canManageInventory: false,
  });

  useEffect(() => {
    if (!open) return;
    setPassword('');
    if (user) {
      setFullName(user.fullName);
      setEmail(user.email);
      setRole(user.role);
      setPerms({
        canManageProducts: user.canManageProducts,
        canManageServices: user.canManageServices,
        canManagePurchases: user.canManagePurchases,
        canManageInventory: user.canManageInventory,
      });
    } else {
      setFullName('');
      setEmail('');
      setRole('STAFF');
      setPerms({
        canManageProducts: false,
        canManageServices: false,
        canManagePurchases: false,
        canManageInventory: false,
      });
    }
  }, [open, user]);

  // Admins implicitly have everything; only send grants for staff.
  const grants = role === 'STAFF' ? perms : {
    canManageProducts: false,
    canManageServices: false,
    canManagePurchases: false,
    canManageInventory: false,
  };

  const submit = async () => {
    if (!fullName.trim()) return toast.error('Full name is required');
    if (!email.trim()) return toast.error('Email is required');
    try {
      if (isEdit) {
        await update.mutateAsync({
          id: user!.id,
          input: { fullName: fullName.trim(), email: email.trim(), role, ...grants },
        });
        toast.success('User updated', fullName);
      } else {
        if (password.length < 8) return toast.error('Password must be at least 8 characters');
        await create.mutateAsync({ fullName: fullName.trim(), email: email.trim(), role, password, ...grants });
        toast.success('User created', fullName);
      }
      onClose();
    } catch (e) {
      toast.error('Save failed', extractMessage(e));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit User' : 'Add User'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} loading={saving} icon="check">{isEdit ? 'Save' : 'Create user'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Full name" required>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Mwangi" />
        </Field>
        <Field label="Email" required>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@kjstationery.co.tz" />
        </Field>
        <Field label="Role" required>
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>
        {role === 'STAFF' ? (
          <div className="rounded-xl border border-outline-variant p-4">
            <p className="text-label-caps uppercase tracking-wide text-on-surface-variant">Permissions</p>
            <p className="mt-0.5 text-[12px] text-on-surface-variant">
              Staff can sell and view by default. Grant extra management rights below.
            </p>
            <div className="mt-3 space-y-2">
              <Checkbox
                id="perm-products"
                label="Manage products (add/edit products & categories)"
                checked={perms.canManageProducts}
                onChange={(e) => setPerms((p) => ({ ...p, canManageProducts: e.target.checked }))}
              />
              <Checkbox
                id="perm-services"
                label="Manage services (add/edit services)"
                checked={perms.canManageServices}
                onChange={(e) => setPerms((p) => ({ ...p, canManageServices: e.target.checked }))}
              />
              <Checkbox
                id="perm-purchases"
                label="Manage purchases (record stock & manage units)"
                checked={perms.canManagePurchases}
                onChange={(e) => setPerms((p) => ({ ...p, canManagePurchases: e.target.checked }))}
              />
              <Checkbox
                id="perm-inventory"
                label="Manage inventory (adjust stock counts)"
                checked={perms.canManageInventory}
                onChange={(e) => setPerms((p) => ({ ...p, canManageInventory: e.target.checked }))}
              />
            </div>
          </div>
        ) : (
          <div className="flex gap-2 rounded-xl bg-surface-container-low p-3 text-[13px] text-on-surface-variant">
            <Icon name="info" size={16} className="mt-0.5 shrink-0" />
            <span>Administrators have full access to everything.</span>
          </div>
        )}
        {!isEdit && (
          <Field label="Temporary password" required hint="Min 8 chars with upper, lower and a number/symbol">
            <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Str0ng!Pass" />
          </Field>
        )}
      </div>
    </Modal>
  );
}

function PasswordModal({ user, onClose }: { user: User | null; onClose: () => void }) {
  const toast = useToast();
  const setPw = useSetUserPassword();
  const [password, setPassword] = useState('');

  useEffect(() => setPassword(''), [user]);

  const submit = async () => {
    if (password.length < 8) return toast.error('Password must be at least 8 characters');
    try {
      await setPw.mutateAsync({ id: user!.id, password });
      toast.success('Password reset', `${user!.fullName}'s sessions were revoked.`);
      onClose();
    } catch (e) {
      toast.error('Failed', extractMessage(e));
    }
  };

  return (
    <Modal
      open={!!user}
      onClose={onClose}
      size="sm"
      title="Reset Password"
      subtitle={user?.fullName}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={setPw.isPending}>Cancel</Button>
          <Button onClick={submit} loading={setPw.isPending} icon="lock_reset">Reset Password</Button>
        </>
      }
    >
      <Field label="New password" required hint="Min 8 chars with upper, lower and a number/symbol">
        <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" autoFocus />
      </Field>
    </Modal>
  );
}
