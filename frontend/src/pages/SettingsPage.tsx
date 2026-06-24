import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Dropdown,
  EmptyState,
  Field,
  Icon,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Tabs,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  Textarea,
} from '@/components/ui';
import { useTheme } from '@/providers/ThemeProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import {
  useCategories,
  useCreateCategory,
  useCreateSupplier,
  useDeleteCategory,
  useSuppliers,
  useUpdateCategory,
  useUpdateSupplier,
} from '@/hooks/useCatalog';
import { extractMessage } from '@/lib/api';
import { cn, initials } from '@/lib/utils';
import type { Category, Supplier } from '@/types';

interface BusinessSettings {
  name: string;
  address: string;
  phone: string;
  email: string;
  taxId: string;
  receiptHeader: string;
  receiptFooter: string;
  showLogo: boolean;
}

const DEFAULTS: BusinessSettings = {
  name: 'KJ Stationery',
  address: 'Dar es Salaam, Tanzania',
  phone: '',
  email: 'klikcelltechnologiesltd@gmail.com',
  taxId: '',
  receiptHeader: 'KJ Stationery — Thank you for your business!',
  receiptFooter: 'Goods sold are not returnable after 7 days.',
  showLogo: true,
};

const KEY = 'sp.business';

function loadSettings(): BusinessSettings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}

type TabKey = 'business' | 'receipt' | 'preferences' | 'categories' | 'suppliers';

export default function SettingsPage() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<TabKey>('business');

  const items = [
    { value: 'business' as const, label: 'Business', icon: 'business' },
    { value: 'receipt' as const, label: 'Receipt', icon: 'receipt_long' },
    { value: 'preferences' as const, label: 'Preferences', icon: 'tune' },
    ...(isAdmin
      ? [
          { value: 'categories' as const, label: 'Categories', icon: 'category' },
          { value: 'suppliers' as const, label: 'Suppliers', icon: 'local_shipping' },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-gutter">
      <PageHeader title="Settings" description="Configure business information, receipts, and system preferences." />
      <Tabs value={tab} onChange={(v) => setTab(v as TabKey)} items={items} />

      {tab === 'business' && <BusinessTab />}
      {tab === 'receipt' && <ReceiptTab />}
      {tab === 'preferences' && <PreferencesTab />}
      {tab === 'categories' && isAdmin && <CategoriesTab />}
      {tab === 'suppliers' && isAdmin && <SuppliersTab />}
    </div>
  );
}

function BusinessTab() {
  const toast = useToast();
  const [s, setS] = useState<BusinessSettings>(loadSettings);
  const set = (k: keyof BusinessSettings, v: string) => setS((p) => ({ ...p, [k]: v }));

  const save = () => {
    localStorage.setItem(KEY, JSON.stringify(s));
    toast.success('Settings saved', 'Business information updated.');
  };

  return (
    <Card>
      <CardHeader title="Business Information" subtitle="Appears on receipts and reports" />
      <CardBody className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Business name"><Input value={s.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Phone"><Input value={s.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+255…" /></Field>
          <Field label="Email"><Input type="email" value={s.email} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Tax / TIN"><Input value={s.taxId} onChange={(e) => set('taxId', e.target.value)} /></Field>
          <Field label="Address" className="sm:col-span-2"><Textarea value={s.address} onChange={(e) => set('address', e.target.value)} /></Field>
        </div>
        <div className="flex justify-end"><Button icon="save" onClick={save}>Save Changes</Button></div>
      </CardBody>
    </Card>
  );
}

function ReceiptTab() {
  const toast = useToast();
  const [s, setS] = useState<BusinessSettings>(loadSettings);

  const save = () => {
    localStorage.setItem(KEY, JSON.stringify(s));
    toast.success('Receipt settings saved');
  };

  return (
    <div className="grid grid-cols-1 gap-gutter lg:grid-cols-2">
      <Card>
        <CardHeader title="Receipt Settings" subtitle="Customize printed receipts" />
        <CardBody className="space-y-4">
          <Field label="Receipt header"><Textarea value={s.receiptHeader} onChange={(e) => setS((p) => ({ ...p, receiptHeader: e.target.value }))} /></Field>
          <Field label="Receipt footer"><Textarea value={s.receiptFooter} onChange={(e) => setS((p) => ({ ...p, receiptFooter: e.target.value }))} /></Field>
          <label className="flex cursor-pointer items-center justify-between rounded-xl border border-outline-variant px-4 py-3">
            <span className="text-body-sm font-medium text-on-surface">Show logo on receipt</span>
            <input type="checkbox" checked={s.showLogo} onChange={(e) => setS((p) => ({ ...p, showLogo: e.target.checked }))} className="h-5 w-5 rounded text-secondary focus:ring-secondary" />
          </label>
          <div className="flex justify-end"><Button icon="save" onClick={save}>Save Changes</Button></div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Preview" subtitle="How your receipt header & footer appear" />
        <CardBody>
          <div className="mx-auto max-w-xs rounded-xl border border-dashed border-outline-variant bg-surface-container-low p-5 text-center font-mono-data text-[12px] text-on-surface">
            {s.showLogo && (
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-on-primary">
                <Icon name="inventory_2" size={20} filled />
              </div>
            )}
            <p className="font-bold">{s.name}</p>
            <p className="whitespace-pre-wrap text-on-surface-variant">{s.receiptHeader}</p>
            <div className="my-3 border-t border-dashed border-outline-variant" />
            <div className="flex justify-between"><span>Item × 1</span><span>1,000</span></div>
            <div className="flex justify-between"><span>TOTAL</span><span>1,000</span></div>
            <div className="my-3 border-t border-dashed border-outline-variant" />
            <p className="whitespace-pre-wrap text-on-surface-variant">{s.receiptFooter}</p>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function PreferencesTab() {
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  return (
    <div className="grid grid-cols-1 gap-gutter lg:grid-cols-2">
      <Card>
        <CardHeader title="Appearance" subtitle="Choose your interface theme" />
        <CardBody>
          <div className="grid grid-cols-2 gap-3">
            {(['light', 'dark'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all',
                  theme === t ? 'border-secondary bg-secondary-container/30' : 'border-outline-variant hover:bg-surface-container-low',
                )}
              >
                <Icon name={t === 'light' ? 'light_mode' : 'dark_mode'} size={26} className={theme === t ? 'text-secondary' : 'text-on-surface-variant'} />
                <span className="text-body-sm font-semibold capitalize">{t} mode</span>
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Your Profile" />
        <CardBody>
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-h3 font-bold text-on-primary">
              {user ? initials(user.fullName) : '—'}
            </span>
            <div>
              <p className="text-body-lg font-semibold text-on-surface">{user?.fullName}</p>
              <p className="text-body-sm text-on-surface-variant">{user?.email}</p>
              <Badge tone={user?.role === 'ADMIN' ? 'navy' : 'neutral'} className="mt-1">{user?.role}</Badge>
            </div>
          </div>
          <div className="mt-4 rounded-xl bg-surface-container-low p-3 text-[13px] text-on-surface-variant">
            <Icon name="info" size={16} className="mr-1" />
            Contact an administrator to change your role or reset your password.
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function CategoriesTab() {
  const toast = useToast();
  const { data, isLoading } = useCategories();
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const del = useDeleteCategory();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const openForm = (c: Category | null) => {
    setEditing(c);
    setName(c?.name ?? '');
    setDescription(c?.description ?? '');
    setOpen(true);
  };

  const submit = async () => {
    if (!name.trim()) return toast.error('Name is required');
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, input: { name: name.trim(), description: description.trim() || undefined } });
        toast.success('Category updated');
      } else {
        await create.mutateAsync({ name: name.trim(), description: description.trim() || undefined });
        toast.success('Category created');
      }
      setOpen(false);
    } catch (e) {
      toast.error('Save failed', extractMessage(e));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await del.mutateAsync(deleting.id);
      toast.success('Category deleted');
      setDeleting(null);
    } catch (e) {
      toast.error('Delete failed', extractMessage(e));
    }
  };

  return (
    <Card>
      <CardHeader title="Product Categories" action={<Button size="sm" icon="add" onClick={() => openForm(null)}>Add Category</Button>} />
      {isLoading ? (
        <LoadingState />
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState icon="category" title="No categories" description="Group your products by adding categories." />
      ) : (
        <Table>
          <THead><TH>Name</TH><TH>Description</TH><TH align="center">Products</TH><TH align="right">Actions</TH></THead>
          <TBody>
            {data!.map((c) => (
              <TR key={c.id}>
                <TD className="font-semibold">{c.name}</TD>
                <TD className="text-on-surface-variant">{c.description || '—'}</TD>
                <TD align="center" className="font-mono-data">{c._count?.products ?? 0}</TD>
                <TD align="right">
                  <Dropdown actions={[
                    { label: 'Edit', icon: 'edit', onClick: () => openForm(c) },
                    { label: 'Delete', icon: 'delete', danger: true, onClick: () => setDeleting(c) },
                  ]} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit Category' : 'Add Category'}
        footer={<>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} loading={create.isPending || update.isPending} icon="check">Save</Button>
        </>}
      >
        <div className="space-y-4">
          <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Writing" /></Field>
          <Field label="Description"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={del.isPending}
        title="Delete category?"
        message={`"${deleting?.name}" will be removed. Products keep their data but become uncategorized.`}
        confirmLabel="Delete"
        icon="delete"
      />
    </Card>
  );
}

function SuppliersTab() {
  const toast = useToast();
  const { data, isLoading } = useSuppliers({ limit: 100 });
  const create = useCreateSupplier();
  const update = useUpdateSupplier();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '' });

  const openForm = (s: Supplier | null) => {
    setEditing(s);
    setForm({ name: s?.name ?? '', phone: s?.phone ?? '', email: s?.email ?? '', address: s?.address ?? '' });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim()) return toast.error('Name is required');
    const input = {
      name: form.name.trim(),
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      address: form.address.trim() || undefined,
    };
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, input });
        toast.success('Supplier updated');
      } else {
        await create.mutateAsync(input);
        toast.success('Supplier created');
      }
      setOpen(false);
    } catch (e) {
      toast.error('Save failed', extractMessage(e));
    }
  };

  const toggleActive = async (s: Supplier) => {
    try {
      await update.mutateAsync({ id: s.id, input: { isActive: !s.isActive } });
      toast.success(s.isActive ? 'Supplier deactivated' : 'Supplier activated');
    } catch (e) {
      toast.error('Failed', extractMessage(e));
    }
  };

  return (
    <Card>
      <CardHeader title="Suppliers" action={<Button size="sm" icon="add" onClick={() => openForm(null)}>Add Supplier</Button>} />
      {isLoading ? (
        <LoadingState />
      ) : (data?.data.length ?? 0) === 0 ? (
        <EmptyState icon="local_shipping" title="No suppliers" description="Add suppliers to attribute purchases." />
      ) : (
        <Table>
          <THead><TH>Name</TH><TH>Contact</TH><TH align="center">Status</TH><TH align="right">Actions</TH></THead>
          <TBody>
            {data!.data.map((s) => (
              <TR key={s.id}>
                <TD className="font-semibold">{s.name}</TD>
                <TD className="text-on-surface-variant">
                  {s.phone || s.email || '—'}
                  {s.address && <span className="block text-[12px]">{s.address}</span>}
                </TD>
                <TD align="center"><Badge tone={s.isActive ? 'success' : 'neutral'}>{s.isActive ? 'Active' : 'Inactive'}</Badge></TD>
                <TD align="right">
                  <Dropdown actions={[
                    { label: 'Edit', icon: 'edit', onClick: () => openForm(s) },
                    { label: s.isActive ? 'Deactivate' : 'Activate', icon: s.isActive ? 'block' : 'check_circle', danger: s.isActive, onClick: () => toggleActive(s) },
                  ]} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit Supplier' : 'Add Supplier'}
        footer={<>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} loading={create.isPending || update.isPending} icon="check">Save</Button>
        </>}
      >
        <div className="space-y-4">
          <Field label="Name" required><Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /></Field>
            <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} /></Field>
          </div>
          <Field label="Address"><Textarea value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} /></Field>
        </div>
      </Modal>
    </Card>
  );
}
