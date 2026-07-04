import { useEffect, useState } from 'react';
import { Button, Checkbox, Field, Icon, Input, Modal, Select } from '@/components/ui';
import { useToast } from '@/providers/ToastProvider';
import { useCreateUser, useSetUserPassword, useUpdateUser } from '@/hooks/useUsers';
import { ROLE_OPTIONS } from '@/lib/constants';
import { PERMISSION_OPTIONS } from '@/lib/permissions';
import { extractMessage } from '@/lib/api';
import type { Role, User } from '@/types';

export function UserFormModal({ open, onClose, user }: { open: boolean; onClose: () => void; user: User | null }) {
  const toast = useToast();
  const create = useCreateUser();
  const update = useUpdateUser();
  const isEdit = !!user;
  const saving = create.isPending || update.isPending;

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('STAFF');
  const [password, setPassword] = useState('');
  const [perms, setPerms] = useState<string[]>([]);
  const toggle = (key: string, on: boolean) =>
    setPerms((p) => (on ? [...new Set([...p, key])] : p.filter((k) => k !== key)));

  useEffect(() => {
    if (!open) return;
    setPassword('');
    if (user) {
      setFullName(user.fullName);
      setEmail(user.email);
      setRole(user.role);
      setPerms(user.permissions ?? []);
    } else {
      setFullName('');
      setEmail('');
      setRole('STAFF');
      setPerms([]);
    }
  }, [open, user]);

  // Admins implicitly have everything; only send grants for staff.
  const grants = role === 'STAFF' ? perms : [];

  const submit = async () => {
    if (!fullName.trim()) return toast.error('Full name is required');
    if (!email.trim()) return toast.error('Email is required');
    try {
      if (isEdit) {
        await update.mutateAsync({
          id: user!.id,
          input: { fullName: fullName.trim(), email: email.trim(), role, permissions: grants },
        });
        toast.success('User updated', fullName);
      } else {
        if (password.length < 8) return toast.error('Password must be at least 8 characters');
        await create.mutateAsync({
          fullName: fullName.trim(),
          email: email.trim(),
          role,
          password,
          permissions: grants,
        });
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
      size="lg"
      title={isEdit ? 'Edit User' : 'Add User'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} loading={saving} icon="check">{isEdit ? 'Save' : 'Create user'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        </div>
        {role === 'STAFF' ? (
          <div className="rounded-xl border border-outline-variant p-4">
            <p className="text-label-caps uppercase tracking-wide text-on-surface-variant">Permissions</p>
            <p className="mt-0.5 text-[12px] text-on-surface-variant">
              Staff can sell and view by default. Grant extra management rights below.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {PERMISSION_OPTIONS.map((o) => (
                <Checkbox
                  key={o.key}
                  id={`perm-${o.key}`}
                  label={`${o.label} — ${o.hint}`}
                  checked={perms.includes(o.key)}
                  onChange={(e) => toggle(o.key, e.target.checked)}
                />
              ))}
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

export function PasswordModal({ user, onClose }: { user: User | null; onClose: () => void }) {
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
