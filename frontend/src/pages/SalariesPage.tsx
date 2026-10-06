import { useEffect, useState } from 'react';
import {
  Badge,
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
  RangeOptions,
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
import { PaidFromField, useHeldCash } from '@/features/expenses/PaidFromField';
import {
  useCreateSalary,
  useDeleteExpense,
  useSalaries,
  useSalaryPayees,
  useSalarySummary,
  useUpdateSalary,
} from '@/hooks/useExpenses';
import { useClientSort, useTableSort } from '@/hooks/useSort';
import { PAGE_SIZE } from '@/lib/constants';
import { extractMessage } from '@/lib/api';
import { currency, formatDate, num } from '@/lib/utils';
import { rangeFor, type RangeKey } from '@/lib/dateRange';
import type { Expense, PaymentSource } from '@/types';

type ViewKey = 'staff' | 'payments';

/** Salaries entered before they carried a name are grouped under this. */
const UNNAMED = 'Not named';

const periodLabel = (iso: string | null | undefined) =>
  iso ? formatDate(iso, 'MMMM yyyy') : '—';

/**
 * Salaries are expenses under the Salary category — they count in reports,
 * profit and the till like any other cost. This page only reads them by
 * person, and records the two things a salary needs that an expense does not:
 * who was paid, and for which month.
 */
export default function SalariesPage() {
  const [view, setView] = useState<ViewKey>('staff');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [payee, setPayee] = useState('');
  const [rangeKey, setRangeKey] = useState<RangeKey>('this-month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);

  const range = rangeFor(rangeKey, customFrom, customTo);
  const summary = useSalarySummary(range);
  const list = useTableSort({ by: 'expenseDate', dir: 'desc' }, () => setPage(1));
  const payments = useSalaries({
    page,
    limit: PAGE_SIZE,
    ...list.params,
    search: search || undefined,
    payeeName: payee || undefined,
    ...range,
  });

  const staffSort = useClientSort(summary.data?.staff, { by: 'total', dir: 'desc' }, {
    payeeName: (r) => (r.payeeName ?? '').toLowerCase(),
    payments: (r) => r.payments,
    lastPayPeriod: (r) => r.lastPayPeriod ?? '',
    lastPaidOn: (r) => r.lastPaidOn ?? '',
    total: (r) => num(r.total),
  });
  const named = (summary.data?.staff ?? []).filter((s) => s.payeeName);

  // Drill from a person's totals into their payments.
  const openPerson = (name: string | null) => {
    if (!name) return;
    setPayee(name);
    setSearch('');
    setPage(1);
    setView('payments');
  };

  const canModify = (e: Expense) => e.cashSession?.status !== 'CLOSED';

  return (
    <div className="flex flex-col gap-gutter">
      <PageHeader
        title="Salaries"
        info="What each member of staff has been paid. Every payment is still an expense under Salary, so it counts in your reports, profit and till."
        actions={
          <Button icon="add" onClick={() => setCreateOpen(true)}>
            Pay Salary
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-gutter sm:grid-cols-3">
        <StatCard
          label="Paid Out"
          icon="badge"
          accent="rose"
          loading={summary.isLoading}
          value={currency(summary.data?.total ?? 0)}
          hint="In the selected range"
        />
        <StatCard
          label="Staff Paid"
          icon="groups"
          accent="violet"
          loading={summary.isLoading}
          value={named.length}
          hint="Distinct people"
        />
        <StatCard
          label="Payments"
          icon="receipt_long"
          accent="cyan"
          loading={summary.isLoading}
          value={summary.data?.payments ?? 0}
          hint={
            summary.data?.payments
              ? `Avg ${currency(num(summary.data.total) / summary.data.payments)}`
              : 'In the selected range'
          }
        />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-outline-variant p-4 lg:flex-row lg:items-center">
          {view === 'payments' ? (
            <SearchInput
              value={search}
              onChange={(v) => { setSearch(v); setPage(1); }}
              placeholder="Search names and notes…"
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
                { value: 'staff', label: 'By staff' },
                { value: 'payments', label: 'Payments' },
              ]}
            />
            <Select
              value={rangeKey}
              onChange={(e) => { setRangeKey(e.target.value as RangeKey); setPage(1); }}
              className="w-44"
            >
              <RangeOptions />
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
            {view === 'payments' && (
              <Select
                value={payee}
                onChange={(e) => { setPayee(e.target.value); setPage(1); }}
                className="w-52"
              >
                <option value="">All staff</option>
                {payee && !named.some((s) => s.payeeName === payee) && (
                  <option value={payee}>{payee}</option>
                )}
                {named.map((s) => (
                  <option key={s.payeeName!} value={s.payeeName!}>{s.payeeName}</option>
                ))}
              </Select>
            )}
          </div>
        </div>

        {view === 'staff' ? (
          summary.isLoading ? (
            <LoadingState label="Loading salaries…" />
          ) : summary.isError ? (
            <ErrorState message={extractMessage(summary.error)} onRetry={summary.refetch} />
          ) : staffSort.rows.length === 0 ? (
            <EmptyState
              icon="badge"
              title="No salaries in this range"
              description="Pick a different range, or record a salary payment."
              action={<Button icon="add" onClick={() => setCreateOpen(true)}>Pay Salary</Button>}
            />
          ) : (
            <Table>
              <THead sort={staffSort.sort} onSort={staffSort.onSort}>
                <TH sortKey="payeeName">Staff</TH>
                <TH align="center" sortKey="payments" sortDefault="desc">Payments</TH>
                <TH sortKey="lastPayPeriod" sortDefault="desc">Latest month paid</TH>
                <TH sortKey="lastPaidOn" sortDefault="desc">Last paid on</TH>
                <TH align="right" sortKey="total" sortDefault="desc">Total paid</TH>
                <TH align="right">Action</TH>
              </THead>
              <TBody>
                {staffSort.rows.map((s) => (
                  <TR
                    key={s.payeeName ?? UNNAMED}
                    onClick={s.payeeName ? () => openPerson(s.payeeName) : undefined}
                  >
                    <TD>
                      <PayeeCell name={s.payeeName} />
                    </TD>
                    <TD align="center" className="font-mono-data">{s.payments}</TD>
                    <TD>{periodLabel(s.lastPayPeriod)}</TD>
                    <TD>{formatDate(s.lastPaidOn)}</TD>
                    <TD align="right" className="font-mono-data font-bold text-error">
                      −{currency(s.total)}
                    </TD>
                    <TD align="right">
                      {s.payeeName && (
                        <Icon name="chevron_right" size={20} className="text-on-surface-variant" />
                      )}
                    </TD>
                  </TR>
                ))}
                <TR className="bg-surface-container-low">
                  <TD className="font-semibold">Total</TD>
                  <TD align="center" className="font-mono-data font-semibold">
                    {summary.data!.payments}
                  </TD>
                  <TD />
                  <TD />
                  <TD align="right" className="font-mono-data font-bold text-error">
                    −{currency(summary.data!.total)}
                  </TD>
                  <TD />
                </TR>
              </TBody>
            </Table>
          )
        ) : payments.isLoading ? (
          <LoadingState />
        ) : payments.isError ? (
          <ErrorState message={extractMessage(payments.error)} onRetry={payments.refetch} />
        ) : payments.data!.data.length === 0 ? (
          <EmptyState
            icon="badge"
            title="No salary payments found"
            description="Try another range or person, or record a salary payment."
            action={<Button icon="add" onClick={() => setCreateOpen(true)}>Pay Salary</Button>}
          />
        ) : (
          <>
            <Table>
              <THead sort={list.sort} onSort={list.onSort}>
                <TH sortKey="payeeName">Staff</TH>
                <TH sortKey="payPeriod" sortDefault="desc">For month</TH>
                <TH sortKey="expenseDate" sortDefault="desc">Paid on</TH>
                <TH>Paid from</TH>
                <TH sortKey="user">Recorded by</TH>
                <TH align="right" sortKey="amount" sortDefault="desc">Amount</TH>
                <TH align="right">Actions</TH>
              </THead>
              <TBody>
                {payments.data!.data.map((e) => (
                  <TR key={e.id}>
                    <TD>
                      <PayeeCell name={e.payeeName ?? null} note={e.description} />
                    </TD>
                    <TD>{periodLabel(e.payPeriod)}</TD>
                    <TD>{formatDate(e.expenseDate)}</TD>
                    <TD>
                      <Badge tone={e.paidFrom === 'HELD_CASH' ? 'info' : 'neutral'}>
                        {e.paidFrom === 'HELD_CASH' ? 'Held cash' : 'Till'}
                      </Badge>
                    </TD>
                    <TD className="text-on-surface-variant">{e.user?.fullName ?? '—'}</TD>
                    <TD align="right" className="font-mono-data font-bold text-error">
                      −{currency(e.amount)}
                    </TD>
                    <TD align="right">
                      {canModify(e) ? (
                        <span className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setEditing(e)}
                            className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                            title="Edit salary payment"
                          >
                            <Icon name="edit" size={18} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleting(e)}
                            className="rounded-lg p-1.5 text-on-surface-variant hover:bg-error-container hover:text-error"
                            title="Delete salary payment"
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
            <Pagination meta={payments.data!.meta} onPage={setPage} />
          </>
        )}
      </Card>

      <SalaryFormModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <SalaryFormModal
        open={!!editing}
        salary={editing ?? undefined}
        onClose={() => setEditing(null)}
      />
      <DeleteSalaryDialog salary={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}

function PayeeCell({ name, note }: { name: string | null; note?: string | null }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-error-container text-error">
        <Icon name="badge" size={18} />
      </span>
      <span className="min-w-0">
        <span className={name ? 'block font-medium' : 'block italic text-on-surface-variant'}>
          {name ?? UNNAMED}
        </span>
        {note && (
          <span className="block max-w-xs truncate text-body-sm text-on-surface-variant">{note}</span>
        )}
      </span>
    </span>
  );
}

function DeleteSalaryDialog({ salary, onClose }: { salary: Expense | null; onClose: () => void }) {
  const toast = useToast();
  const del = useDeleteExpense();

  const confirm = async () => {
    if (!salary) return;
    try {
      await del.mutateAsync(salary.id);
      toast.success('Salary payment deleted', `${currency(salary.amount)} removed.`);
      onClose();
    } catch (e) {
      toast.error('Failed to delete salary payment', extractMessage(e));
    }
  };

  return (
    <ConfirmDialog
      open={!!salary}
      onClose={onClose}
      onConfirm={confirm}
      loading={del.isPending}
      icon="delete"
      title="Delete this salary payment?"
      confirmLabel="Delete"
      message={
        salary ? (
          <>
            {currency(salary.amount)} to {salary.payeeName ?? 'an unnamed person'} for{' '}
            {periodLabel(salary.payPeriod)}, paid {formatDate(salary.expenseDate)}. This cannot be
            undone.
          </>
        ) : (
          ''
        )
      }
    />
  );
}

const today = () => new Date().toISOString().slice(0, 10);

/** Records a salary payment, or edits one when `salary` is given. */
function SalaryFormModal({
  open,
  salary,
  onClose,
}: {
  open: boolean;
  salary?: Expense;
  onClose: () => void;
}) {
  const toast = useToast();
  const create = useCreateSalary();
  const update = useUpdateSalary();
  const payees = useSalaryPayees();
  const held = useHeldCash();
  const isEdit = !!salary;
  // The held-cash ledger has its own row for this money; the API refuses a new
  // amount, so the field says so up front instead of failing on save.
  const amountLocked = isEdit && salary!.paidFrom === 'HELD_CASH';

  const [payeeName, setPayeeName] = useState('');
  const [payPeriod, setPayPeriod] = useState('');
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState(today);
  const [description, setDescription] = useState('');
  const [paidFrom, setPaidFrom] = useState<PaymentSource>('TILL');

  useEffect(() => {
    if (!open) return;
    setPayeeName(salary?.payeeName ?? '');
    setPayPeriod((salary?.payPeriod ?? salary?.expenseDate ?? today()).slice(0, 7));
    setAmount(salary?.amount ?? '');
    setPaidOn((salary?.expenseDate ?? today()).slice(0, 10));
    setDescription(salary?.description ?? '');
    setPaidFrom('TILL');
  }, [open, salary]);

  const pending = create.isPending || update.isPending;

  const submit = async () => {
    const name = payeeName.trim();
    if (!name) return toast.error('Who was paid?', 'Enter the name of the person paid.');
    if (!payPeriod) return toast.error('Pick the month this pay covers');
    if (num(amount) <= 0) return toast.error('Enter an amount greater than zero');
    if (!isEdit && paidFrom === 'HELD_CASH' && num(amount) > held) {
      return toast.error('More than is held', `Only ${currency(held)} is being held.`);
    }
    const input = {
      payeeName: name,
      payPeriod,
      amount: num(amount),
      paidOn: new Date(paidOn).toISOString(),
      description: description.trim() || undefined,
    };
    try {
      if (isEdit) {
        await update.mutateAsync({ id: salary!.id, input });
        toast.success('Salary payment updated', `${currency(amount)} — ${name}`);
      } else {
        await create.mutateAsync({ ...input, paidFrom });
        toast.success(
          'Salary recorded',
          `${currency(amount)} to ${name} for ${periodLabel(`${payPeriod}-01`)}${
            paidFrom === 'HELD_CASH' ? ' · paid from held cash' : ''
          }`,
        );
      }
      onClose();
    } catch (e) {
      toast.error(isEdit ? 'Failed to update salary' : 'Failed to record salary', extractMessage(e));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? 'Edit Salary Payment' : 'Pay Salary'}
      subtitle={
        isEdit
          ? 'Changes flow through to the till and your reports'
          : paidFrom === 'HELD_CASH'
            ? 'Paid from the cash being held at the shop — no till involved'
            : 'Booked as a Salary expense; if a cash session is open, it comes out of the till'
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button onClick={submit} loading={pending} icon="check">
            {isEdit ? 'Save Changes' : 'Record Salary'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Paid to" required hint="Pick a name or type a new one">
          <Input
            list="salary-payees"
            value={payeeName}
            onChange={(e) => setPayeeName(e.target.value)}
            placeholder="e.g. Warda Hamid"
            autoComplete="off"
          />
          <datalist id="salary-payees">
            {(payees.data ?? []).map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </Field>
        <Field label="For month" required>
          <Input type="month" value={payPeriod} onChange={(e) => setPayPeriod(e.target.value)} />
        </Field>
        <Field
          label="Amount"
          required
          hint={amountLocked ? 'Paid from held cash — delete and re-record to change it' : undefined}
        >
          <Input
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            disabled={amountLocked}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Paid on" required>
          <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </Field>
        {/* Asked only when recording: an edit cannot move money that already moved. */}
        {!isEdit && (
          <div className="sm:col-span-2">
            <PaidFromField value={paidFrom} onChange={setPaidFrom} />
          </div>
        )}
        <Field label="Note" className="sm:col-span-2">
          <Textarea
            rows={2}
            className="min-h-0"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional — e.g. advance, part of the month…"
          />
        </Field>
      </div>
    </Modal>
  );
}
