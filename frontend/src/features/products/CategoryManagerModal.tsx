import { useEffect, useState } from 'react';
import { Button, EmptyState, Icon, Input, LoadingState, Modal } from '@/components/ui';
import { useToast } from '@/providers/ToastProvider';
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from '@/hooks/useCatalog';
import { extractMessage } from '@/lib/api';
import type { Category } from '@/types';

export function CategoryManagerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const { data: categories, isLoading } = useCategories();
  const createCat = useCreateCategory();
  const updateCat = useUpdateCategory();
  const deleteCat = useDeleteCategory();

  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    setNewName('');
    setEditingId(null);
    setConfirmId(null);
  }, [open]);

  const add = async () => {
    const name = newName.trim();
    if (!name) {
      toast.error('Name required', 'Enter a category name.');
      return;
    }
    try {
      await createCat.mutateAsync({ name });
      setNewName('');
      toast.success('Category created', name);
    } catch (e) {
      toast.error('Failed to create', extractMessage(e));
    }
  };

  const startEdit = (c: Category) => {
    setConfirmId(null);
    setEditingId(c.id);
    setEditName(c.name);
  };

  const saveEdit = async () => {
    const name = editName.trim();
    if (!name) {
      toast.error('Name required', 'Enter a category name.');
      return;
    }
    try {
      await updateCat.mutateAsync({ id: editingId!, input: { name } });
      setEditingId(null);
      toast.success('Category updated', name);
    } catch (e) {
      toast.error('Failed to update', extractMessage(e));
    }
  };

  const remove = async (c: Category) => {
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
      size="md"
      title="Manage Categories"
      subtitle="Organize your product catalog"
      footer={
        <Button variant="outline" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Create */}
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            placeholder="New category name…"
          />
          <Button icon="add" loading={createCat.isPending} onClick={add}>
            Add
          </Button>
        </div>

        {/* List */}
        {isLoading ? (
          <LoadingState label="Loading categories…" />
        ) : (categories?.length ?? 0) === 0 ? (
          <EmptyState icon="category" title="No categories yet" description="Add your first category above." />
        ) : (
          <ul className="divide-y divide-outline-variant rounded-xl border border-outline-variant">
            {categories!.map((c) => {
              const count = c._count?.products ?? 0;
              const isEditing = editingId === c.id;
              const isConfirming = confirmId === c.id;
              return (
                <li key={c.id} className="flex items-center gap-3 p-3">
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
                        className="flex-1"
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
                        {count > 0 && (
                          <p className="text-[12px] text-on-surface-variant">
                            {count} product{count === 1 ? '' : 's'} will become uncategorized.
                          </p>
                        )}
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
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-on-surface">{c.name}</p>
                        <p className="text-[12px] text-on-surface-variant">
                          {count} product{count === 1 ? '' : 's'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => startEdit(c)}
                        className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                        title="Rename"
                      >
                        <Icon name="edit" size={18} />
                      </button>
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
