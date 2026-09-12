import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
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
  Select,
  SegmentedControl,
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
  useCreateOfficePurchase,
  useOfficePurchases,
  useOfficePurchasesOutstanding,
  usePayOfficePurchase,
  type OfficePurchaseItemInput,
} from '@/hooks/useExpenses';
import { useTableSort } from '@/hooks/useSort';
import { extractMessage } from '@/lib/api';
import { PAGE_SIZE } from '@/lib/constants';
import { currency, endOfToday, formatDate, num, startOfMonth } from '@/lib/utils';
import type { Expense, PaymentMethod, PaymentSource } from '@/types';

type Settlement = 'ALL' | 'UNPAID' | 'PAID';

export default function OfficePurchasesPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [payFor, setPayFor] = useState<Expense | null>(null);
  const [settlement, setSettlement] = useState<Settlement>('ALL');

  const { sort, onSort, params } = useTableSort({ by: 'expenseDate', dir: 'desc' }, () => setPage(1));
  const { data, isLoading, isError, refetch, error } = useOfficePurchases({
    page,
    limit: PAGE_SIZE,
    settlement: settlement === 'ALL' ? undefined : settlement,
    ...params,
  });

  const month = useOfficePurchases({ from: startOfMonth(), to: endOfToday(), limit: 100 });
  const monthRows = month.data?.data ?? [];
  const monthTotal = monthRows.reduce((a, e) => a + num(e.amount), 0);
  const monthItems = monthRows.reduce((a, e) => a + (e.items?.length ?? 0), 0);

  // The payable side: what vendors are still waiting for, across all time.
  const owed = useOfficePurchasesOutstanding();

  return (
    <div className="flex flex-col gap-gutter">
      <PageHeader
        title="Office Purchases"
        description="Record goods bought for internal/office use (not for resale). Booked as a cost, never added to sellable stock."
        actions={
          <Button icon="add" onClick={() => setCreateOpen(true)}>
            New Office Purchase
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-gutter sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Owed to Vendors"
          icon="schedule_send"
          accent="amber"
          loading={owed.isLoading}
          value={currency(owed.data?.total ?? 0)}
          hint={
            owed.data?.count
              ? `${owed.data.count} unpaid · oldest ${formatDate(owed.data.oldest!)}`
              : 'Everything is settled'
          }
        />
        <StatCard
          label="This Month"
          icon="business_center"
          accent="violet"
          loading={month.isLoading}
          value={currency(monthTotal)}
          hint={`${monthRows.length} purchase(s)`}
        />
        <StatCard
          label="Items Bought"
          icon="inventory_2"
          accent="blue"
          loading={month.isLoading}
          value={monthItems}
          hint="This month"
        />
        <StatCard
          label="Avg / Purchase"
          icon="bar_chart"
          accent="cyan"
          loading={month.isLoading}
          value={currency(monthRows.length ? monthTotal / monthRows.length : 0)}
          hint="This month"
        />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant px-4 py-3">
          <SegmentedControl
            value={settlement}
            onChange={(v) => {
              setSettlement(v);
              setPage(1);
            }}
            items={[
              { value: 'ALL', label: 'All' },
              { value: 'UNPAID', label: 'Unpaid' },
              { value: 'PAID', label: 'Paid' },
            ]}
          />
          {settlement === 'UNPAID' && (
            <p className="text-body-sm text-on-surface-variant">
              Cash leaves the till on the day you pay, not the day you bought.
            </p>
          )}
        </div>
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message={extractMessage(error)} onRetry={refetch} />
        ) : data!.data.length === 0 ? (
          settlement === 'UNPAID' ? (
            <EmptyState
              icon="task_alt"
              title="Nothing owed"
              description="Every office purchase has been paid for."
            />
          ) : (
            <EmptyState
              icon="business_center"
              title="No office purchases yet"
              description="Record items you bought for the office to track internal-use spending."
              action={<Button icon="add" onClick={() => setCreateOpen(true)}>New Office Purchase</Button>}
            />
          )
        ) : (
          <>
            <Table>
              <THead sort={sort} onSort={onSort}>
                <TH sortKey="expenseDate" sortDefault="desc">Date</TH>
                <TH sortKey="supplierName">Supplier</TH>
                <TH sortKey="items" sortDefault="desc">Items</TH>
                <TH sortKey="user">Recorded by</TH>
                <TH align="right" sortKey="amount" sortDefault="desc">Total</TH>
                <TH align="right" sortKey="amountDue" sortDefault="desc">Owed</TH>
                <TH align="right">Action</TH>
              </THead>
              <TBody>
                {data!.data.map((e) => {
                  const due = num(e.amountDue);
                  return (
                    <TR key={e.id} onClick={() => navigate(`/office-purchases/${e.id}`)}>
                      <TD>{formatDate(e.expenseDate)}</TD>
                      <TD>{e.supplierName || '—'}</TD>
                      <TD className="max-w-xs truncate text-on-surface-variant">
                        {itemsSummary(e)}
                      </TD>
                      <TD className="text-on-surface-variant">{e.user?.fullName ?? '—'}</TD>
                      <TD align="right" className="font-mono-data font-bold text-error">
                        −{currency(e.amount)}
                      </TD>
                      <TD align="right">
                        <SettlementBadge expense={e} />
                      </TD>
                      <TD align="right">
                        {due > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            icon="payments"
                            onClick={(ev) => {
                              // The row itself opens the purchase; this pays it.
                              ev.stopPropagation();
                              setPayFor(e);
                            }}
                          >
                            Pay
                          </Button>
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            <Pagination meta={data!.meta} onPage={setPage} />
          </>
        )}
      </Card>

      <CreateOfficePurchaseModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <PayOfficePurchaseModal expense={payFor} onClose={() => setPayFor(null)} />
    </div>
  );
}

/**
 * What is still owed on a purchase. Paid purchases say so quietly; a partial
 * payment has to show the figure, since that is the number someone will be
 * asked for.
 */
export function SettlementBadge({ expense }: { expense: Expense }) {
  const due = num(expense.amountDue);
  if (due <= 0) return <Badge tone="success">Paid</Badge>;
  const paid = num(expense.amountPaid);
  return (
    <div className="inline-flex items-center gap-2">
      <span className="font-mono-data font-bold text-on-surface">{currency(due)}</span>
      <Badge tone={paid > 0 ? 'warning' : 'error'}>{paid > 0 ? 'Part-paid' : 'Unpaid'}</Badge>
    </div>
  );
}

function itemsSummary(e: Expense): string {
  const items = e.items ?? [];
  if (items.length === 0) return '—';
  const first = items[0].name;
  return items.length > 1 ? `${first} +${items.length - 1} more` : first;
}

interface DraftItem {
  key: string;
  name: string;
  quantity: string;
  unitCost: string;
}

const newDraft = (): DraftItem => ({
  key: crypto.randomUUID(),
  name: '',
  quantity: '1',
  unitCost: '',
});

function CreateOfficePurchaseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const create = useCreateOfficePurchase();
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [supplierName, setSupplierName] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<DraftItem[]>([newDraft()]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [amountPaid, setAmountPaid] = useState('');
  const [paidFrom, setPaidFrom] = useState<PaymentSource>('TILL');
  const held = useHeldCash();

  useEffect(() => {
    if (open) {
      setPurchaseDate(new Date().toISOString().slice(0, 10));
      setSupplierName('');
      setNotes('');
      setItems([newDraft()]);
      setPaymentMethod('CASH');
      setAmountPaid('');
      setPaidFrom('TILL');
    }
  }, [open]);

  const addRow = () => setItems((p) => [...p, newDraft()]);
  const updateRow = (key: string, patch: Partial<DraftItem>) =>
    setItems((p) => p.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const removeRow = (key: string) => setItems((p) => p.filter((i) => i.key !== key));

  const total = items.reduce((a, i) => a + num(i.quantity) * num(i.unitCost), 0);
  const onCredit = paymentMethod === 'CREDIT';
  const paidNow = onCredit ? (amountPaid === '' ? 0 : num(amountPaid)) : total;
  const owed = Math.max(0, total - paidNow);
  const payingTooMuch = onCredit && paidNow > total;

  const submit = async () => {
    const valid = items.filter((i) => i.name.trim() && num(i.quantity) > 0 && num(i.unitCost) >= 0);
    if (valid.length === 0) {
      toast.error('Add at least one item', 'Enter an item name, quantity and unit cost.');
      return;
    }
    // On credit the vendor's name is the only record of whom the shop owes.
    if (onCredit && !supplierName.trim()) {
      toast.error('Name the supplier', 'A purchase on credit has to say who is owed.');
      return;
    }
    if (payingTooMuch) {
      toast.error('More than the total', 'The part-payment cannot exceed the purchase total.');
      return;
    }
    if (paidFrom === 'HELD_CASH' && paidNow > held) {
      toast.error('More than is held', `Only ${currency(held)} is being held.`);
      return;
    }
    const payloadItems: OfficePurchaseItemInput[] = valid.map((i) => ({
      name: i.name.trim(),
      quantity: parseInt(i.quantity, 10),
      unitCost: num(i.unitCost),
    }));
    try {
      await create.mutateAsync({
        purchaseDate: new Date(purchaseDate).toISOString(),
        supplierName: supplierName.trim() || undefined,
        description: notes.trim() || undefined,
        paymentMethod,
        amountPaid: onCredit ? paidNow : undefined,
        paidFrom,
        items: payloadItems,
      });
      toast.success(
        'Office purchase recorded',
        onCredit && owed > 0
          ? `${currency(owed)} owed to ${supplierName.trim()} · nothing taken from the till`
          : `${valid.length} item(s) · ${currency(total)} paid from ${
              paidFrom === 'HELD_CASH' ? 'held cash' : 'the till'
            }`,
      );
      onClose();
    } catch (e) {
      toast.error('Failed to record', extractMessage(e));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="New Office Purchase"
      subtitle="Goods for internal use, booked as a cost and not added to sellable stock"
      footer={
        <>
          <div className="mr-auto text-body-sm text-on-surface-variant">
            Total: <span className="font-mono-data font-bold text-on-surface">{currency(total)}</span>
            {onCredit && owed > 0 && (
              <>
                {' · '}
                <span className="font-mono-data font-bold text-error">{currency(owed)}</span> owed
              </>
            )}
          </div>
          <Button variant="outline" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending} icon="check">
            Record Purchase
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Date" required>
            <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
          </Field>
          <Field
            label="Supplier / vendor"
            hint={onCredit ? 'required — who is owed' : 'optional'}
            required={onCredit}
          >
            <Input
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              placeholder="e.g. Acme Supplies"
            />
          </Field>
        </div>

        {/* Whether the shop pays now or owes it. The cost counts against this
            month either way; only the cash differs. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Payment"
            hint={
              onCredit
                ? 'Nothing leaves the till now — pay the vendor later'
                : 'Paid out of the open till now'
            }
          >
            <Select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
            >
              <option value="CASH">Pay now (cash from till)</option>
              <option value="CREDIT">On credit (pay later)</option>
            </Select>
          </Field>
          {onCredit && (
            <Field
              label="Paid now"
              hint="Leave blank if nothing was handed over"
              error={payingTooMuch ? 'More than the purchase total.' : undefined}
            >
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                placeholder="0.00"
              />
            </Field>
          )}
          {/* Nothing handed over means no pot is touched, so there is nothing
              to choose between. */}
          {paidNow > 0 && <PaidFromField value={paidFrom} onChange={setPaidFrom} />}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-label-caps uppercase tracking-wide text-on-surface-variant">Items</span>
            <Button size="sm" variant="ghost" icon="add" onClick={addRow}>
              Add line
            </Button>
          </div>
          <div className="space-y-2">
            {items.map((row) => {
              const lineTotal = num(row.quantity) * num(row.unitCost);
              return (
                <div key={row.key} className="flex flex-wrap items-end gap-2 rounded-xl border border-outline-variant p-2.5">
                  <Field label="Item" className="min-w-[180px] flex-1">
                    <Input
                      value={row.name}
                      onChange={(e) => updateRow(row.key, { name: e.target.value })}
                      placeholder="e.g. Printer paper"
                    />
                  </Field>
                  <Field label="Qty" className="w-20">
                    <Input
                      type="number"
                      min="1"
                      value={row.quantity}
                      onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                    />
                  </Field>
                  <Field label="Unit cost" className="w-32">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.unitCost}
                      onChange={(e) => updateRow(row.key, { unitCost: e.target.value })}
                    />
                  </Field>
                  <div className="w-28 pb-2.5 text-right font-mono-data text-body-sm font-semibold">
                    {currency(lineTotal)}
                  </div>
                  <button
                    onClick={() => removeRow(row.key)}
                    disabled={items.length === 1}
                    className="mb-1.5 rounded-lg p-2 text-on-surface-variant hover:bg-surface-container hover:text-error disabled:opacity-30"
                  >
                    <Icon name="delete" size={18} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes…" />
        </Field>
      </div>
    </Modal>
  );
}


/**
 * Settles part or all of an office purchase bought on credit. The cash comes
 * out of today's till, which is the whole point of recording the debt
 * separately — the drawer is charged on the day the money actually moves.
 */
export function PayOfficePurchaseModal({
  expense,
  onClose,
}: {
  expense: Expense | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const pay = usePayOfficePurchase();
  const [amount, setAmount] = useState('');
  const [paidFrom, setPaidFrom] = useState<PaymentSource>('TILL');
  const held = useHeldCash();

  const due = expense ? num(expense.amountDue) : 0;

  useEffect(() => {
    // Most payments clear the whole balance, so that is what it opens on.
    if (expense) {
      setAmount(String(num(expense.amountDue)));
      setPaidFrom('TILL');
    }
  }, [expense]);

  const paying = amount === '' ? 0 : num(amount);
  const tooMuch = paying > due;
  const left = Math.max(0, due - paying);

  const submit = async () => {
    if (!expense) return;
    if (paying <= 0) return toast.error('Enter an amount to pay');
    if (tooMuch) {
      return toast.error('More than is owed', `Only ${currency(due)} is still outstanding.`);
    }
    if (paidFrom === 'HELD_CASH' && paying > held) {
      return toast.error('More than is held', `Only ${currency(held)} is being held.`);
    }
    try {
      await pay.mutateAsync({ id: expense.id, amount: paying, paidFrom });
      toast.success(
        'Payment recorded',
        left > 0
          ? `${currency(paying)} paid · ${currency(left)} still owed`
          : `${currency(paying)} paid · settled in full`,
      );
      onClose();
    } catch (e) {
      toast.error('Could not record payment', extractMessage(e));
    }
  };

  return (
    <Modal
      open={!!expense}
      onClose={onClose}
      title="Pay Office Purchase"
      subtitle={
        expense
          ? `${expense.supplierName || 'Vendor'} · ${formatDate(expense.expenseDate)}`
          : undefined
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pay.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={pay.isPending} icon="payments">
            Record Payment
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-surface-container-low p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-body-sm text-on-surface-variant">Still owed</span>
            <span className="font-mono-data text-h3 font-bold text-error">{currency(due)}</span>
          </div>
          {expense && num(expense.amountPaid) > 0 && (
            <p className="mt-1 text-body-sm text-on-surface-variant">
              {currency(expense.amountPaid)} of {currency(expense.amount)} already paid
            </p>
          )}
        </div>

        <Field
          label="Amount to pay now"
          required
          hint={
            paidFrom === 'HELD_CASH'
              ? 'Comes out of the cash being held at the shop'
              : 'Comes out of the open till today'
          }
          error={tooMuch ? 'More than is still owed.' : undefined}
        >
          <Input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
          />
        </Field>

        <PaidFromField value={paidFrom} onChange={setPaidFrom} />

        {paying > 0 && !tooMuch && (
          <p className="text-body-sm text-on-surface-variant">
            {left > 0 ? (
              <>
                Leaves <span className="font-mono-data font-bold text-on-surface">{currency(left)}</span> owed.
              </>
            ) : (
              'Settles this purchase in full.'
            )}
          </p>
        )}
      </div>
    </Modal>
  );
}
