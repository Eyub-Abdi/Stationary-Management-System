import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Button,
  Card,
  ConfirmDialog,
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
  SegmentedControl,
  Select,
  StatCard,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  Textarea,
} from '@/components/ui';
import { useToast } from '@/providers/ToastProvider';
import { useAuth } from '@/providers/AuthProvider';
import {
  useCreateExpense,
  useDeleteExpense,
  useExpenses,
  useExpensesDaily,
  useUpdateExpense,
} from '@/hooks/useExpenses';
import { useExpenseCategories } from '@/hooks/useExpenseCategories';
import { ExpenseCategoryManagerModal } from '@/features/expenses/ExpenseCategoryManagerModal';
import { DEFAULT_EXPENSE_ICON } from '@/lib/constants';
import { extractMessage } from '@/lib/api';
import { currency, endOfToday, formatDate, num, startOfMonth } from '@/lib/utils';
import { rangeFor, toDateInput, type RangeKey } from '@/lib/dateRange';
import type { Expense, ExpenseCategory } from '@/types';

type ViewKey = 'list' | 'daily';

/** Categories offered when recording: active ones the caller may actually use.
 *  The API already hides management-only categories from staff. */
const selectableCategories = (categories: ExpenseCategory[] | undefined) =>
  (categories ?? []).filter((c) => c.isActive);

/** Mirrors the backend rule: anything in a closed till is frozen, and staff may
 *  only correct their own entries on the day they recorded them. */
const isSameDay = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
};

export default function ExpensesPage() {
  const { isAdmin, user } = useAuth();
  const [searchParams] = useSearchParams();
  const initialDate = searchParams.get('date') ?? '';

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const [rangeKey, setRangeKey] = useState<RangeKey>(initialDate ? 'custom' : 'all');
  const [customFrom, setCustomFrom] = useState(initialDate);
  const [customTo, setCustomTo] = useState(initialDate);
  const [view, setView] = useState<ViewKey>(() =>
    initialDate ? 'list' : localStorage.getItem('expenses-view') === 'daily' ? 'daily' : 'list',
  );
  useEffect(() => {
    localStorage.setItem('expenses-view', view);
  }, [view]);

  const range = rangeFor(rangeKey, customFrom, customTo);
  const { data, isLoading, isError, refetch, error } = useExpenses({
    page,
    limit: 12,
    search: search || undefined,
    categoryId: categoryId || undefined,
    ...range,
  });
  const { data: categories } = useExpenseCategories();

  const daily = useExpensesDaily(range, view === 'daily');
  const dailyRows = daily.data ?? [];
  const dailyTotal = dailyRows.reduce((a, r) => a + num(r.total), 0);
  const dailyCount = dailyRows.reduce((a, r) => a + r.count, 0);

  // Drill into a single day: filter the expenses list to that date.
  const openDay = (period: string) => {
    const day = toDateInput(period);
    if (!day) return;
    setCustomFrom(day);
    setCustomTo(day);
    setRangeKey('custom');
    setSearch('');
    setCategoryId('');
    setPage(1);
    setView('list');
  };

  const canModify = (e: Expense) => {
    if (e.cashSession?.status === 'CLOSED') return false;
    if (isAdmin) return true;
    return e.userId === user?.id && isSameDay(e.createdAt);
  };

  const monthExpenses = useExpenses({ from: startOfMonth(), to: endOfToday(), limit: 100 });
  const monthTotal = (monthExpenses.data?.data ?? []).reduce((a, e) => a + num(e.amount), 0);

  return (
    <div className="flex flex-col gap-gutter">
      <PageHeader
        title={isAdmin ? 'Expenses' : 'Petty Cash'}
        description={
          isAdmin
            ? 'Record and review operating expenses across all categories.'
            : 'Record day-to-day petty-cash spending (toner, paper, transport and the like).'
        }
        actions={
          <>
            {isAdmin && (
              <Button variant="outline" icon="tune" onClick={() => setManageOpen(true)}>
                Manage Categories
              </Button>
            )}
            <Button icon="add" onClick={() => setCreateOpen(true)}>
              {isAdmin ? 'Add Expense' : 'Add Petty Cash'}
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-gutter sm:grid-cols-3">
        <StatCard
          label="This Month"
          icon="payments"
          accent="error"
          loading={monthExpenses.isLoading}
          value={currency(monthTotal)}
          hint={`${monthExpenses.data?.data.length ?? 0} entries`}
        />
        <StatCard
          label="Categories Used"
          icon="category"
          accent="primary"
          loading={monthExpenses.isLoading}
          value={new Set((monthExpenses.data?.data ?? []).map((e) => e.category)).size}
          hint="Distinct this month"
        />
        <StatCard
          label="Avg / Entry"
          icon="bar_chart"
          accent="tertiary"
          loading={monthExpenses.isLoading}
          value={currency(monthExpenses.data?.data.length ? monthTotal / monthExpenses.data.data.length : 0)}
          hint="This month"
        />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-outline-variant p-4 lg:flex-row lg:items-center">
          {view === 'list' ? (
            <SearchInput
              value={search}
              onChange={(v) => { setSearch(v); setPage(1); }}
              placeholder="Search descriptions…"
              className="flex-1"
            />
          ) : (
            <div className="flex-1" />
          )}
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl<ViewKey>
              value={view}
              onChange={setView}
              items={[
                { value: 'list', label: 'Expenses' },
                { value: 'daily', label: 'Daily totals' },
              ]}
            />
            <Select
              value={rangeKey}
              onChange={(e) => { setRangeKey(e.target.value as RangeKey); setPage(1); }}
              className="w-40"
            >
              <option value="all">All time</option>
              <option value="today">Today</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="custom">Custom range</option>
            </Select>
            {rangeKey === 'custom' && (
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  aria-label="From date"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={(e) => { setCustomFrom(e.target.value); setPage(1); }}
                  className="w-40"
                />
                <span className="text-on-surface-variant">–</span>
                <Input
                  type="date"
                  aria-label="To date"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={(e) => { setCustomTo(e.target.value); setPage(1); }}
                  className="w-40"
                />
              </div>
            )}
            {view === 'list' && (
              <Select
                value={categoryId}
                onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}
                className="w-52"
              >
                <option value="">All categories</option>
                {/* Archived categories still filter, so past entries stay reachable. */}
                {(categories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.isActive ? '' : ' (archived)'}
                  </option>
                ))}
              </Select>
            )}
          </div>
        </div>

        {view === 'daily' ? (
          daily.isLoading ? (
            <LoadingState label="Loading daily totals…" />
          ) : daily.isError ? (
            <ErrorState message={extractMessage(daily.error)} onRetry={daily.refetch} />
          ) : dailyRows.length === 0 ? (
            <EmptyState
              icon="calendar_month"
              title="No expenses in this range"
              description="Pick a different date range to see daily totals."
            />
          ) : (
            <Table>
              <THead>
                <TH>Date</TH>
                <TH align="center">Entries</TH>
                <TH align="right">Total</TH>
                <TH align="right">Action</TH>
              </THead>
              <TBody>
                {dailyRows.map((r) => (
                  <TR key={r.period} onClick={() => openDay(r.period)}>
                    <TD className="whitespace-nowrap font-medium">{formatDate(r.period)}</TD>
                    <TD align="center" className="font-mono-data">{r.count}</TD>
                    <TD align="right" className="font-mono-data font-bold text-error">−{currency(r.total)}</TD>
                    <TD align="right">
                      <Icon name="chevron_right" size={20} className="text-on-surface-variant" />
                    </TD>
                  </TR>
                ))}
                <TR className="bg-surface-container-low">
                  <TD className="font-semibold">Total</TD>
                  <TD align="center" className="font-mono-data font-semibold">{dailyCount}</TD>
                  <TD align="right" className="font-mono-data font-bold text-error">−{currency(dailyTotal)}</TD>
                  <TD />
                </TR>
              </TBody>
            </Table>
          )
        ) : isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message={extractMessage(error)} onRetry={refetch} />
        ) : data!.data.length === 0 ? (
          <EmptyState
            icon="payments"
            title="No expenses found"
            description="Record your first expense to start tracking spending."
            action={<Button icon="add" onClick={() => setCreateOpen(true)}>Add Expense</Button>}
          />
        ) : (
          <>
            <Table>
              <THead>
                <TH>Category</TH>
                <TH>Description</TH>
                <TH>Date</TH>
                <TH>Recorded by</TH>
                <TH align="right">Amount</TH>
                <TH align="right">Actions</TH>
              </THead>
              <TBody>
                {data!.data.map((e) => (
                  <TR key={e.id}>
                    <TD>
                      <span className="flex items-center gap-2.5">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-error-container text-error">
                          <Icon name={e.category?.icon || DEFAULT_EXPENSE_ICON} size={18} />
                        </span>
                        <span className="font-medium">{e.category?.name ?? '—'}</span>
                      </span>
                    </TD>
                    <TD className="max-w-xs truncate text-on-surface-variant">{e.description || '—'}</TD>
                    <TD>{formatDate(e.expenseDate)}</TD>
                    <TD className="text-on-surface-variant">{e.user?.fullName ?? '—'}</TD>
                    <TD align="right" className="font-mono-data font-bold text-error">−{currency(e.amount)}</TD>
                    <TD align="right">
                      {canModify(e) ? (
                        <span className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setEditing(e)}
                            className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                            title="Edit expense"
                          >
                            <Icon name="edit" size={18} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleting(e)}
                            className="rounded-lg p-1.5 text-on-surface-variant hover:bg-error-container hover:text-error"
                            title="Delete expense"
                          >
                            <Icon name="delete" size={18} />
                          </button>
                        </span>
                      ) : (
                        <span className="text-[12px] text-on-surface-variant">Locked</span>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination meta={data!.meta} onPage={setPage} />
          </>
        )}
      </Card>

      <ExpenseFormModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <ExpenseFormModal
        open={!!editing}
        expense={editing ?? undefined}
        onClose={() => setEditing(null)}
      />
      <DeleteExpenseDialog expense={deleting} onClose={() => setDeleting(null)} />
      <ExpenseCategoryManagerModal open={manageOpen} onClose={() => setManageOpen(false)} />
    </div>
  );
}

function DeleteExpenseDialog({
  expense,
  onClose,
}: {
  expense: Expense | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const del = useDeleteExpense();

  const confirm = async () => {
    if (!expense) return;
    try {
      await del.mutateAsync(expense.id);
      toast.success('Expense deleted', `${currency(expense.amount)} removed.`);
      onClose();
    } catch (e) {
      toast.error('Failed to delete expense', extractMessage(e));
    }
  };

  return (
    <ConfirmDialog
      open={!!expense}
      onClose={onClose}
      onConfirm={confirm}
      loading={del.isPending}
      icon="delete"
      title="Delete this expense?"
      confirmLabel="Delete"
      message={
        expense ? (
          <>
            {currency(expense.amount)} — {expense.category?.name} on{' '}
            {formatDate(expense.expenseDate)}.
            {(expense.items?.length ?? 0) > 0 && ' Its line items are removed too.'}
            {' '}This cannot be undone.
          </>
        ) : (
          ''
        )
      }
    />
  );
}

/** Records a new expense, or edits an existing one when `expense` is given. */
function ExpenseFormModal({
  open,
  expense,
  onClose,
}: {
  open: boolean;
  expense?: Expense;
  onClose: () => void;
}) {
  const toast = useToast();
  const { isAdmin } = useAuth();
  const create = useCreateExpense();
  const update = useUpdateExpense();
  const { data: categories } = useExpenseCategories();
  const options = selectableCategories(categories);
  const isEdit = !!expense;
  // Office purchases derive their amount and category from their line items.
  const isItemized = (expense?.items?.length ?? 0) > 0;

  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!open) return;
    setCategoryId(expense?.categoryId ?? '');
    setAmount(expense?.amount ?? '');
    setDate((expense?.expenseDate ?? new Date().toISOString()).slice(0, 10));
    setDescription(expense?.description ?? '');
  }, [open, expense]);

  // A category chosen before it was archived stays selectable while editing.
  const shownOptions =
    expense && !options.some((o) => o.id === expense.categoryId) && expense.category
      ? [expense.category, ...options]
      : options;

  const pending = create.isPending || update.isPending;

  const submit = async () => {
    if (!isItemized && num(amount) <= 0) {
      return toast.error('Enter an amount greater than zero');
    }
    if (!isItemized && !categoryId) return toast.error('Pick a category');
    const name = shownOptions.find((o) => o.id === categoryId)?.name ?? '';
    try {
      if (isEdit) {
        await update.mutateAsync({
          id: expense!.id,
          input: {
            // The itemized flow owns these two fields; leave them untouched.
            categoryId: isItemized ? undefined : categoryId,
            amount: isItemized ? undefined : num(amount),
            expenseDate: new Date(date).toISOString(),
            description: description.trim() || undefined,
          },
        });
        toast.success('Expense updated', `${currency(amount)} — ${name}`);
      } else {
        await create.mutateAsync({
          categoryId,
          amount: num(amount),
          expenseDate: new Date(date).toISOString(),
          description: description.trim() || undefined,
        });
        toast.success('Expense recorded', `${currency(amount)} — ${name}`);
      }
      onClose();
    } catch (e) {
      toast.error(isEdit ? 'Failed to update expense' : 'Failed to record expense', extractMessage(e));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Expense' : isAdmin ? 'Add Expense' : 'Add Petty Cash'}
      subtitle={
        isEdit
          ? 'Changes flow through to the till and your reports'
          : 'If a cash session is open, this is deducted from the till'
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button onClick={submit} loading={pending} icon="check">
            {isEdit ? 'Save Changes' : 'Record Expense'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {isItemized && (
          <p className="rounded-xl bg-surface-container-low p-3 text-body-sm text-on-surface-variant">
            This is an itemized office purchase — its amount and category come from its
            line items. You can still edit the date and description here.
          </p>
        )}
        <Field label="Category" required>
          <Select
            value={categoryId}
            disabled={isItemized}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="" disabled>Select a category…</option>
            {shownOptions.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Amount" required>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              disabled={isItemized}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="Date" required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Description">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional details…" />
        </Field>
      </div>
    </Modal>
  );
}
