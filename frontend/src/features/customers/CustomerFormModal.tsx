import { useEffect, useState } from 'react';
import { Button, Checkbox, Field, Input, Modal, Textarea } from '@/components/ui';
import { useToast } from '@/providers/ToastProvider';
import {
  useCreateCustomer,
  useUpdateCustomer,
  type CustomerInput,
} from '@/hooks/useCustomers';
import { extractMessage } from '@/lib/api';
import { num } from '@/lib/utils';
import type { Customer } from '@/types';

export function CustomerFormModal({
  open,
  onClose,
  customer,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  customer: Customer | null;
  /** Called with the newly created customer (not fired on edits). */
  onCreated?: (customer: Customer) => void;
}) {
  const toast = useToast();
  const create = useCreateCustomer();
  const update = useUpdateCustomer();
  const isEdit = !!customer;
  const saving = create.isPending || update.isPending;

  const [form, setForm] = useState<CustomerInput>({ name: '' });
  const [creditLimit, setCreditLimit] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(
      customer
        ? {
            name: customer.name,
            phone: customer.phone ?? '',
            email: customer.email ?? '',
            address: customer.address ?? '',
            isActive: customer.isActive,
          }
        : { name: '', phone: '', email: '', address: '' },
    );
    setCreditLimit(customer?.creditLimit ? num(customer.creditLimit).toString() : '');
  }, [open, customer]);

  const set = (k: keyof CustomerInput, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error('Name required', 'Enter the customer name.');
      return;
    }
    const payload: CustomerInput = {
      name: form.name.trim(),
      phone: form.phone?.trim() || undefined,
      email: form.email?.trim() || undefined,
      address: form.address?.trim() || undefined,
      // '' clears the limit (unlimited); a value sets it.
      creditLimit: creditLimit.trim() === '' ? null : num(creditLimit),
      ...(isEdit ? { isActive: form.isActive } : {}),
    };
    try {
      if (isEdit) {
        await update.mutateAsync({ id: customer!.id, input: payload });
        toast.success('Customer updated', `${payload.name} saved.`);
      } else {
        const created = await create.mutateAsync(payload);
        toast.success('Customer created', `${payload.name} added.`);
        onCreated?.(created);
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
      title={isEdit ? 'Edit Customer' : 'New Customer'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving} icon="check">
            {isEdit ? 'Save changes' : 'Create customer'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" required>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Juma Bakari" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Phone">
            <Input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} placeholder="07xx xxx xxx" />
          </Field>
          <Field label="Email">
            <Input value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} placeholder="optional" />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Credit limit" hint="Blank = unlimited">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={creditLimit}
              onChange={(e) => setCreditLimit(e.target.value)}
              placeholder="e.g. 200000"
            />
          </Field>
        </div>
        <Field label="Address">
          <Textarea value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} placeholder="Optional…" />
        </Field>
        {isEdit && (
          <Checkbox
            id="cust-active"
            label="Active"
            checked={form.isActive ?? true}
            onChange={(e) => set('isActive', e.target.checked)}
          />
        )}
      </div>
    </Modal>
  );
}
