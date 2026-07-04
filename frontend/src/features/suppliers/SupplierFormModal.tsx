import { useEffect, useState } from 'react';
import { Button, Checkbox, Field, Input, Modal, Textarea } from '@/components/ui';
import { useToast } from '@/providers/ToastProvider';
import { useCreateSupplier, useUpdateSupplier, type SupplierInput } from '@/hooks/useCatalog';
import { extractMessage } from '@/lib/api';
import type { Supplier } from '@/types';

export function SupplierFormModal({
  open,
  onClose,
  supplier,
}: {
  open: boolean;
  onClose: () => void;
  supplier: Supplier | null;
}) {
  const toast = useToast();
  const create = useCreateSupplier();
  const update = useUpdateSupplier();
  const isEdit = !!supplier;
  const saving = create.isPending || update.isPending;

  const [form, setForm] = useState<SupplierInput>({ name: '' });

  useEffect(() => {
    if (!open) return;
    setForm(
      supplier
        ? {
            name: supplier.name,
            phone: supplier.phone ?? '',
            email: supplier.email ?? '',
            address: supplier.address ?? '',
            isActive: supplier.isActive,
          }
        : { name: '', phone: '', email: '', address: '' },
    );
  }, [open, supplier]);

  const set = (k: keyof SupplierInput, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error('Name required', 'Enter the supplier name.');
      return;
    }
    const payload: SupplierInput = {
      name: form.name.trim(),
      phone: form.phone?.trim() || undefined,
      email: form.email?.trim() || undefined,
      address: form.address?.trim() || undefined,
      ...(isEdit ? { isActive: form.isActive } : {}),
    };
    try {
      if (isEdit) {
        await update.mutateAsync({ id: supplier!.id, input: payload });
        toast.success('Supplier updated', `${payload.name} saved.`);
      } else {
        await create.mutateAsync(payload);
        toast.success('Supplier created', `${payload.name} added.`);
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
      size="md"
      title={isEdit ? 'Edit Supplier' : 'New Supplier'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving} icon="check">
            {isEdit ? 'Save changes' : 'Create supplier'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" required>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Dar Paper Distributors" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Phone">
            <Input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} placeholder="07xx xxx xxx" />
          </Field>
          <Field label="Email">
            <Input value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} placeholder="optional" />
          </Field>
        </div>
        <Field label="Address">
          <Textarea value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} placeholder="Optional…" />
        </Field>
        {isEdit && (
          <Checkbox
            id="sup-active"
            label="Active"
            checked={form.isActive ?? true}
            onChange={(e) => set('isActive', e.target.checked)}
          />
        )}
      </div>
    </Modal>
  );
}
