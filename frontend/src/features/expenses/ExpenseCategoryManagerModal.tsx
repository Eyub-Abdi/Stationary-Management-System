import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  Field,
  Icon,
  Input,
  LoadingState,
  Modal,
  Select,
} from '@/components/ui';
import { useToast } from '@/providers/ToastProvider';
import {
  useCreateExpenseCategory,
  useDeleteExpenseCategory,
  useExpenseCategories,
  useUpdateExpenseCategory,
} from '@/hooks/useExpenseCategories';
import { DEFAULT_EXPENSE_ICON, EXPENSE_ICON_OPTIONS } from '@/lib/constants';
import { extractMessage } from '@/lib/api';
import type { ExpenseCategory } from '@/types';

/** Office purchases post against this one, so it can't be removed or archived. */
const isProtected = (c: ExpenseCategory) => c.systemKey === 'OFFICE_SUPPLIES';

export function ExpenseCategoryManagerModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const { data: categories, isLoading } = useExpenseCategories();
  const createCat = useCreateExpenseCategory();
  const updateCat = useUpdateExpenseCategory();
  const deleteCat = useDeleteExpenseCategory();

  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState(DEFAULT_EXPENSE_ICON);
  const [newStaffAllowed, setNewStaffAllowed] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState(DEFAULT_EXPENSE_ICON);
  const [editStaffAllowed, setEditStaffAllowed] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    setNewName('');
    setNewIcon(DEFAULT_EXPENSE_ICON);
    setNewStaffAllowed(false);
    setEditingId(null);
    setConfirmId(null);
  }, [open]);

  const add = async () => {
    const name = newName.trim();
    if (!name) return toast.error('Name required', 'Enter a category name.');
    try {
      await createCat.mutateAsync({ name, icon: newIcon, staffAllowed: newStaffAllowed });
      setNewName('');
      setNewIcon(DEFAULT_EXPENSE_ICON);
      setNewStaffAllowed(false);
      toast.success('Category created', name);
    } catch (e) {
      toast.error('Failed to create', extractMessage(e));
    }
  };

  const startEdit = (c: ExpenseCategory) => {
    setConfirmId(null);
    setEditingId(c.id);
    setEditName(c.name);
    setEditIcon(c.icon);
    setEditStaffAllowed(c.staffAllowed);
  };

  const saveEdit = async () => {
    const name = editName.trim();
    if (!name) return toast.error('Name required', 'Enter a category name.');
    try {
      await updateCat.mutateAsync({
        id: editingId!,
        input: { name, icon: editIcon, staffAllowed: editStaffAllowed },
      });
      setEditingId(null);
      toast.success('Category updated', name);
    } catch (e) {
      toast.error('Failed to update', extractMessage(e));
    }
  };

  const toggleArchive = async (c: ExpenseCategory) => {
    try {
      await updateCat.mutateAsync({ id: c.id, input: { isActive: !c.isActive } });
      toast.success(c.isActive ? 'Category archived' : 'Category restored', c.name);
    } catch (e) {
      toast.error('Failed to update', extractMessage(e));
    }
  };

  const remove = async (c: ExpenseCategory) => {
    try {
      await deleteCat.mutateAsync(c.id);
      setConfirmId(null);
      toast.success('Category deleted', `${c.name} removed.`);
    } catch (e) {
      toast.error('Failed to delete', extractMessage(e));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Manage Expense Categories"
      subtitle="Add your own categories and choose which ones staff may use"
      footer={
        <Button variant="outline" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Create */}
        <div className="rounded-xl border border-outline-variant p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label="New category" className="flex-1">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    add();
                  }
                }}
                placeholder="e.g. Water Bill"
              />
            </Field>
            <Field label="Icon" className="w-40">
              <Select value={newIcon} onChange={(e) => setNewIcon(e.target.value)}>
                {EXPENSE_ICON_OPTIONS.map((i) => (
                  <option key={i} value={i}>
                    {i.replace(/_/g, ' ')}
                  </option>
                ))}
              </Select>
            </Field>
            <Button icon="add" loading={createCat.isPending} onClick={add}>
              Add
            </Button>
          </div>
          <div className="mt-3">
            <Checkbox
              id="new-expense-category-staff"
              checked={newStaffAllowed}
              onChange={(e) => setNewStaffAllowed(e.target.checked)}
              label="Staff may record and see this category (petty cash)"
            />
          </div>
        </div>

        {/* List */}
        {isLoading ? (
          <LoadingState label="Loading categories…" />
        ) : (categories?.length ?? 0) === 0 ? (
          <EmptyState
            icon="category"
            title="No expense categories yet"
            description="Add your first category above."
          />
        ) : (
          <ul className="divide-y divide-outline-variant rounded-xl border border-outline-variant">
            {categories!.map((c) => {
              const count = c._count?.expenses ?? 0;
              const isEditing = editingId === c.id;
              const isConfirming = confirmId === c.id;
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-3 p-3">
                  {isEditing ? (
                    <>
                      <Input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            saveEdit();
                          }
                        }}
                        className="min-w-40 flex-1"
                      />
                      <Select
                        value={editIcon}
                        onChange={(e) => setEditIcon(e.target.value)}
                        className="w-36"
                      >
                        {EXPENSE_ICON_OPTIONS.map((i) => (
                          <option key={i} value={i}>
                            {i.replace(/_/g, ' ')}
                          </option>
                        ))}
                      </Select>
                      <Checkbox
                        id={`expense-category-staff-${c.id}`}
                        checked={editStaffAllowed}
                        onChange={(e) => setEditStaffAllowed(e.target.checked)}
                        label="Staff"
                      />
                      <Button type="button" icon="check" loading={updateCat.isPending} onClick={saveEdit}>
                        Save
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : isConfirming ? (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body-sm text-on-surface">
                          Delete <span className="font-semibold">{c.name}</span>?
                        </p>
                        <p className="text-[12px] text-on-surface-variant">
                          This category has never been used, so nothing is lost.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="danger"
                        icon="delete"
                        loading={deleteCat.isPending}
                        onClick={() => remove(c)}
                      >
                        Delete
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setConfirmId(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-error-container text-error">
                        <Icon name={c.icon || DEFAULT_EXPENSE_ICON} size={18} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 truncate font-semibold text-on-surface">
                          {c.name}
                          {!c.isActive && <Badge tone="neutral">Archived</Badge>}
                          {c.staffAllowed && <Badge tone="navy">Staff</Badge>}
                        </p>
                        <p className="text-[12px] text-on-surface-variant">
                          {count} expense{count === 1 ? '' : 's'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => startEdit(c)}
                        className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                        title="Edit"
                      >
                        <Icon name="edit" size={18} />
                      </button>
                      {/* Used categories keep their history — archive instead of delete. */}
                      {!isProtected(c) && (
                        <button
                          type="button"
                          onClick={() => toggleArchive(c)}
                          className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                          title={c.isActive ? 'Archive (hide from new entries)' : 'Restore'}
                        >
                          <Icon name={c.isActive ? 'archive' : 'unarchive'} size={18} />
                        </button>
                      )}
                      {!isProtected(c) && count === 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(null);
                            setConfirmId(c.id);
                          }}
                          className="rounded-lg p-1.5 text-on-surface-variant hover:bg-error-container hover:text-error"
                          title="Delete"
                        >
                          <Icon name="delete" size={18} />
                        </button>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
