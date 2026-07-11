import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Button,
  Card,
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
import { useCreateExpense, useExpenses, useExpensesDaily } from '@/hooks/useExpenses';
import { EXPENSE_CATEGORY_ICON, EXPENSE_CATEGORY_OPTIONS, PETTY_CASH_CATEGORIES } from '@/lib/constants';
import { extractMessage } from '@/lib/api';
import { currency, endOfToday, formatDate, humanize, num, startOfMonth } from '@/lib/utils';
import { rangeFor, toDateInput, type RangeKey } from '@/lib/dateRange';
import type { ExpenseCategory } from '@/types';

type ViewKey = 'list' | 'daily';

// Staff get petty cash only; fixed overheads (rent, salary, electricity, internet)
// are management-only.
const visibleCategoryOptions = (isAdmin: boolean) =>
  isAdmin
    ? EXPENSE_CATEGORY_OPTIONS
    : EXPENSE_CATEGORY_OPTIONS.filter((o) => PETTY_CASH_CATEGORIES.includes(o.value));

export default function ExpensesPage() {
  const { isAdmin } = useAuth();
  const [searchParams] = useSearchParams();
  const initialDate = searchParams.get('date') ?? '';

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<ExpenseCategory | ''>('');
  const [createOpen, setCreateOpen] = useState(false);
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
    category: category || undefined,
    ...range,
  });

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
    setCategory('');
    setPage(1);
    setView('list');
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
          <Button icon="add" onClick={() => setCreateOpen(true)}>
            {isAdmin ? 'Add Expense' : 'Add Petty Cash'}
          </Button>
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
              <Select value={category} onChange={(e) => { setCategory(e.target.value as ExpenseCategory | ''); setPage(1); }} className="w-52">
                <option value="">All categories</option>
                {visibleCategoryOptions(isAdmin).map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
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
              </THead>
              <TBody>
                {data!.data.map((e) => (
                  <TR key={e.id}>
                    <TD>
                      <span className="flex items-center gap-2.5">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-error-container text-error">
                          <Icon name={EXPENSE_CATEGORY_ICON[e.category]} size={18} />
                        </span>
                        <span className="font-medium">{humanize(e.category)}</span>
                      </span>
                    </TD>
                    <TD className="max-w-xs truncate text-on-surface-variant">{e.description || '—'}</TD>
                    <TD>{formatDate(e.expenseDate)}</TD>
                    <TD className="text-on-surface-variant">{e.user?.fullName ?? '—'}</TD>
                    <TD align="right" className="font-mono-data font-bold text-error">−{currency(e.amount)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination meta={data!.meta} onPage={setPage} />
          </>
        )}
      </Card>

      <CreateExpenseModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

function CreateExpenseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const { isAdmin } = useAuth();
  const create = useCreateExpense();
  const [category, setCategory] = useState<ExpenseCategory>('MISCELLANEOUS');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (open) {
      setCategory('MISCELLANEOUS');
      setAmount('');
      setDate(new Date().toISOString().slice(0, 10));
      setDescription('');
    }
  }, [open]);

  const submit = async () => {
    if (num(amount) <= 0) return toast.error('Enter an amount greater than zero');
    try {
      await create.mutateAsync({
        category,
        amount: num(amount),
        expenseDate: new Date(date).toISOString(),
        description: description.trim() || undefined,
      });
      toast.success('Expense recorded', `${currency(amount)} — ${humanize(category)}`);
      onClose();
    } catch (e) {
      toast.error('Failed to record expense', extractMessage(e));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isAdmin ? 'Add Expense' : 'Add Petty Cash'}
      subtitle="If a cash session is open, this is deducted from the till"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={create.isPending}>Cancel</Button>
          <Button onClick={submit} loading={create.isPending} icon="check">Record Expense</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Category" required>
          <Select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
            {visibleCategoryOptions(isAdmin).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Amount" required>
            <Input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
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
