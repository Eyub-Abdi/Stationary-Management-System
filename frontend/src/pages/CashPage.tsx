import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
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
  Tabs,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  Textarea,
} from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { useActiveCashSession } from '@/providers/CashSessionProvider';
import {
  useCashMovement,
  useCashSessions,
  useCashVariances,
  useCloseCashSession,
  useOpenCashSession,
  useSuggestedOpeningFloat,
} from '@/hooks/useCash';
import { useTableSort } from '@/hooks/useSort';
import { extractMessage } from '@/lib/api';
import { PAGE_SIZE } from '@/lib/constants';
import { cn, currency, formatDateTime, num } from '@/lib/utils';
import type { CashMovementType, CashSession } from '@/types';

type TabKey = 'sessions' | 'variances';

export default function CashPage() {
  const { isAdmin } = useAuth();
  const { session, isLoading: sessionLoading } = useActiveCashSession();
  const [tab, setTab] = useState<TabKey>('sessions');
  const [openModal, setOpenModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [moveModal, setMoveModal] = useState(false);

  return (
    <div className="flex flex-col gap-gutter">
      <PageHeader
        title="Cash Management"
        description="One shared till for the whole shop — open it once a day, everyone rings into it, then reconcile."
        actions={
          session ? (
            <>
              <Button variant="outline" icon="swap_horiz" onClick={() => setMoveModal(true)}>
                Cash Movement
              </Button>
              <Button icon="lock" onClick={() => setCloseModal(true)}>
                Close Session
              </Button>
            </>
          ) : (
            <Button icon="lock_open" onClick={() => setOpenModal(true)}>
              Open Session
            </Button>
          )
        }
      />

      {sessionLoading ? (
        <Card><LoadingState label="Checking cash session…" /></Card>
      ) : session ? (
        <ActiveSessionPanel session={session} />
      ) : (
        <Card>
          <EmptyState
            icon="account_balance"
            title="The till is closed"
            description="Open the shop's cash session at the start of the day. Everyone rings into the same session, so it only needs opening once."
            action={<Button icon="lock_open" onClick={() => setOpenModal(true)}>Open Cash Session</Button>}
          />
        </Card>
      )}

      {isAdmin ? (
        <>
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { value: 'sessions', label: 'All Sessions', icon: 'history' },
              { value: 'variances', label: 'Variances', icon: 'rule' },
            ]}
          />
          {tab === 'sessions' ? <SessionsTable /> : <VariancesTable />}
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <h3 className="text-h3 font-semibold text-on-surface">Session history</h3>
          <SessionsTable />
        </div>
      )}

      <OpenSessionModal open={openModal} onClose={() => setOpenModal(false)} />
      {session && (
        <>
          <CloseSessionModal session={session} open={closeModal} onClose={() => setCloseModal(false)} />
          <MovementModal sessionId={session.id} open={moveModal} onClose={() => setMoveModal(false)} />
        </>
      )}
    </div>
  );
}

function ActiveSessionPanel({ session }: { session: CashSession }) {
  const b = session.breakdown;
  return (
    <div className="grid grid-cols-1 gap-gutter lg:grid-cols-12">
      <Card className="lg:col-span-8">
        <CardHeader
          title="Shop Till"
          subtitle={`Opened ${formatDateTime(session.openedAt)}${session.user?.fullName ? ` by ${session.user.fullName}` : ''} · shared by everyone`}
          action={<Badge tone="success" dot>OPEN</Badge>}
        />
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-outline-variant bg-outline-variant sm:grid-cols-3">
          <Cell label="Opening Float" value={currency(b?.openingBalance ?? session.openingBalance)} icon="savings" />
          <Cell label="Cash Sales" value={currency(b?.cashSales ?? 0)} icon="sell" tone="secondary" />
          <Cell label="Customer Payments" value={currency(b?.customerPayments ?? 0)} icon="account_balance_wallet" tone="secondary" />
          <Cell label="Deposits" value={currency(b?.deposits ?? 0)} icon="add_card" tone="secondary" />
          <Cell label="Withdrawals" value={currency(b?.withdrawals ?? 0)} icon="remove" tone="error" />
          <Cell label="Expenses" value={currency(b?.expenses ?? 0)} icon="payments" tone="error" />
          <Cell label="Refunds" value={currency(b?.refunds ?? 0)} icon="undo" tone="error" />
          <Cell label="Purchases" value={currency(b?.purchases ?? 0)} icon="shopping_cart" tone="error" />
          <Cell label="Supplier Payments" value={currency(b?.supplierPayments ?? 0)} icon="local_shipping" tone="error" />
        </div>
      </Card>

      <Card className="flex flex-col justify-center lg:col-span-4">
        <div className="p-6 text-center">
          <p className="text-label-caps uppercase tracking-wide text-on-surface-variant">Expected in Drawer</p>
          <p className="mt-2 font-mono-data text-[40px] font-bold leading-none text-primary">
            {currency(b?.expectedAmount ?? 0)}
          </p>
          <p className="mt-3 text-body-sm text-on-surface-variant">
            Opening + cash sales + customer payments + deposits − expenses − withdrawals − refunds − purchases − supplier payments
          </p>
        </div>
      </Card>
    </div>
  );
}

function Cell({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: string;
  tone?: 'secondary' | 'error';
}) {
  return (
    <div className="bg-surface-container-lowest p-4">
      <div className="mb-1 flex items-center gap-2 text-on-surface-variant">
        <Icon name={icon} size={18} className={tone === 'secondary' ? 'text-secondary' : tone === 'error' ? 'text-error' : undefined} />
        <span className="text-[11px] uppercase tracking-wide">{label}</span>
      </div>
      <p className="font-mono-data text-body-lg font-bold text-on-surface">{value}</p>
    </div>
  );
}

function SessionsTable() {
  const [page, setPage] = useState(1);
  const { sort, onSort, params } = useTableSort({ by: 'openedAt', dir: 'desc' }, () => setPage(1));
  const { data, isLoading, isError, refetch, error } = useCashSessions({
    page,
    limit: PAGE_SIZE,
    ...params,
  });
  return (
    <Card>
      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message={extractMessage(error)} onRetry={refetch} />
      ) : data!.data.length === 0 ? (
        <EmptyState icon="history" title="No sessions yet" />
      ) : (
        <>
          <Table>
            <THead sort={sort} onSort={onSort}>
              <TH sortKey="openedAt" sortDefault="desc">Opened</TH>
              <TH sortKey="user">Cashier</TH>
              <TH align="center" sortKey="status">Status</TH>
              <TH align="right" sortKey="openingBalance" sortDefault="desc">Opening</TH>
              <TH align="right" sortKey="expectedAmount" sortDefault="desc">Expected</TH>
              <TH align="right" sortKey="actualAmount" sortDefault="desc">Actual</TH>
              <TH align="right" sortKey="variance" sortDefault="desc">Variance</TH>
            </THead>
            <TBody>
              {data!.data.map((s) => (
                <TR key={s.id}>
                  <TD className="whitespace-nowrap text-on-surface-variant">{formatDateTime(s.openedAt)}</TD>
                  <TD className="font-medium">{s.user?.fullName ?? '—'}</TD>
                  <TD align="center"><Badge tone={s.status === 'OPEN' ? 'success' : 'neutral'}>{s.status}</Badge></TD>
                  <TD align="right" className="font-mono-data">{currency(s.openingBalance)}</TD>
                  <TD align="right" className="font-mono-data">{s.expectedAmount ? currency(s.expectedAmount) : '—'}</TD>
                  <TD align="right" className="font-mono-data">{s.actualAmount ? currency(s.actualAmount) : '—'}</TD>
                  <TD align="right">
                    {s.variance != null ? <VarianceTag value={num(s.variance)} /> : '—'}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Pagination meta={data!.meta} onPage={setPage} />
        </>
      )}
    </Card>
  );
}

function VariancesTable() {
  const [page, setPage] = useState(1);
  const { sort, onSort, params } = useTableSort({ by: 'closedAt', dir: 'desc' }, () => setPage(1));
  const { data, isLoading, isError, refetch, error } = useCashVariances({
    page,
    limit: PAGE_SIZE,
    ...params,
  });
  return (
    <Card>
      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message={extractMessage(error)} onRetry={refetch} />
      ) : data!.data.length === 0 ? (
        <EmptyState icon="check_circle" title="No variances" description="All closed sessions reconciled perfectly." />
      ) : (
        <>
          <Table>
            <THead sort={sort} onSort={onSort}>
              <TH sortKey="closedAt" sortDefault="desc">Closed</TH>
              <TH sortKey="user">Cashier</TH>
              <TH align="right" sortKey="expectedAmount" sortDefault="desc">Expected</TH>
              <TH align="right" sortKey="actualAmount" sortDefault="desc">Actual</TH>
              <TH align="right" sortKey="variance" sortDefault="desc">Variance</TH>
            </THead>
            <TBody>
              {data!.data.map((s) => (
                <TR key={s.id}>
                  <TD className="whitespace-nowrap text-on-surface-variant">{formatDateTime(s.closedAt)}</TD>
                  <TD className="font-medium">{s.user?.fullName ?? '—'}</TD>
                  <TD align="right" className="font-mono-data">{currency(s.expectedAmount)}</TD>
                  <TD align="right" className="font-mono-data">{currency(s.actualAmount)}</TD>
                  <TD align="right"><VarianceTag value={num(s.variance)} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Pagination meta={data!.meta} onPage={setPage} />
        </>
      )}
    </Card>
  );
}

function VarianceTag({ value }: { value: number }) {
  if (value === 0) {
    return <span className="font-mono-data text-[13px] font-semibold text-secondary">Balanced</span>;
  }
  // Show variance like the other money columns: a colored, signed amount.
  // Negative = drawer short (red), positive = drawer over (green).
  const short = value < 0;
  return (
    <span className={cn('font-mono-data text-[13px] font-semibold', short ? 'text-error' : 'text-secondary')}>
      {short ? '−' : '+'}
      {currency(Math.abs(value))}
    </span>
  );
}

function OpenSessionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const openSession = useOpenCashSession();
  const suggested = useSuggestedOpeningFloat(open);

  // The carry-over float from the last shift's closing count. When a previous
  // shift exists the system fills it in; staff don't recount it.
  const carryOver = suggested.data;
  const hasPrevious = carryOver?.hasPrevious ?? false;

  // Only the very first shift (no history) needs a manually-entered float.
  const [balance, setBalance] = useState('');

  const submit = async () => {
    if (!hasPrevious && num(balance) < 0) return toast.error('Enter a valid opening float');
    try {
      // hasPrevious → omit the amount so the server carries it over authoritatively.
      const s = await openSession.mutateAsync(hasPrevious ? undefined : num(balance));
      toast.success('Cash session opened', `Float ${currency(s.openingBalance)}`);
      setBalance('');
      onClose();
    } catch (e) {
      toast.error('Could not open session', extractMessage(e));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Open Cash Session"
      subtitle={
        hasPrevious
          ? 'The float is carried over from the last shift’s closing count'
          : 'Count the cash in the drawer to start the first shift'
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={openSession.isPending}>Cancel</Button>
          <Button onClick={submit} loading={openSession.isPending} icon="lock_open">Open Session</Button>
        </>
      }
    >
      {suggested.isLoading ? (
        <LoadingState />
      ) : hasPrevious ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl bg-surface-container-low px-4 py-4">
            <div>
              <p className="text-label-caps uppercase tracking-wide text-on-surface-variant">Opening float</p>
              <p className="mt-1 text-[12px] text-on-surface-variant">
                Carried over from {carryOver?.from ? formatDateTime(carryOver.from) : 'the last shift'}
              </p>
            </div>
            <span className="font-mono-data text-h2 font-bold text-primary">{currency(carryOver!.amount)}</span>
          </div>
          {/* Spelling out the subtraction is what makes the figure checkable:
              if the drawer does not hold this much, the last close forgot to
              record what was taken out. */}
          <p className="flex items-center gap-1.5 text-[12px] text-on-surface-variant">
            <Icon name="info" size={16} />
            {num(carryOver?.withdrawn ?? 0) > 0 ? (
              <span>
                {currency(carryOver!.counted)} was counted and{' '}
                {currency(carryOver!.withdrawn)} taken out, leaving this in the drawer.
              </span>
            ) : (
              <span>No need to recount — this is the cash left in the drawer at the last close.</span>
            )}
          </p>
        </div>
      ) : (
        <Field label="Opening float (cash in drawer)" required>
          <Input type="number" min="0" step="0.01" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0.00" autoFocus />
        </Field>
      )}
    </Modal>
  );
}

function CloseSessionModal({
  session,
  open,
  onClose,
}: {
  session: CashSession;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const closeSession = useCloseCashSession();
  const [actual, setActual] = useState('');
  const [withdrawal, setWithdrawal] = useState('');
  // Where the cash goes as it leaves. Asked here because this is the only
  // moment anyone actually knows the answer.
  const [destination, setDestination] = useState<'BANK' | 'KEPT'>('BANK');
  const [notes, setNotes] = useState('');

  const expected = num(session.breakdown?.expectedAmount ?? 0);
  const variance = actual === '' ? null : num(actual) - expected;
  // Expected values carry stray cents (585,399.97), so an exact-zero test
  // reported a balanced drawer as "+TZS 0 (over)". Judge it at the precision
  // the figure is actually shown in — whole shillings.
  const balanced = variance !== null && Math.round(variance) === 0;
  const counted = num(actual);
  const takingOut = withdrawal === '' ? 0 : num(withdrawal);
  const leftInDrawer = counted - takingOut;
  const takingTooMuch = actual !== '' && takingOut > counted;

  const submit = async () => {
    if (actual === '' || num(actual) < 0) return toast.error('Enter the counted cash amount');
    if (takingTooMuch) {
      return toast.error('More than was counted', 'You cannot take out more cash than the drawer holds.');
    }
    try {
      await closeSession.mutateAsync({
        id: session.id,
        actualAmount: counted,
        withdrawal: withdrawal === '' ? undefined : takingOut,
        withdrawalTo: takingOut > 0 && destination === 'BANK' ? 'BANK' : undefined,
        notes: notes.trim() || undefined,
      });
      toast.success(
        'Session closed',
        takingOut > 0
          ? `${currency(takingOut)} ${destination === 'BANK' ? 'banked' : 'taken out'} · ${currency(leftInDrawer)} left for the next shift.`
          : balanced
            ? 'Drawer balanced.'
            : `Variance ${currency(variance ?? 0)}`,
      );
      onClose();
    } catch (e) {
      toast.error('Could not close session', extractMessage(e));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Close Cash Session"
      subtitle="Count the physical cash and reconcile against expected"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={closeSession.isPending}>Cancel</Button>
          <Button onClick={submit} loading={closeSession.isPending} icon="lock">Close & Reconcile</Button>
        </>
      }
    >
      {/* Two columns: what you type on the left, what it adds up to on the
          right. The running total was three stacked boxes before, which is what
          made the dialog tall — as one ledger it is both shorter and readable
          top to bottom, the way the drawer is actually reconciled. */}
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-4">
          <Field label="Actual counted cash" required>
            <Input type="number" min="0" step="0.01" value={actual} onChange={(e) => setActual(e.target.value)} placeholder="0.00" autoFocus />
          </Field>
          {/* Asked after the count, because the count reconciles the whole
              drawer and this only decides what is still there in the morning. */}
          <Field
            label="Cash taken out now"
            hint="Banked or taken home. Leave blank if it all stays in the drawer."
            error={takingTooMuch ? 'More than was counted in the drawer.' : undefined}
          >
            <Input
              type="number"
              min="0"
              step="0.01"
              value={withdrawal}
              onChange={(e) => setWithdrawal(e.target.value)}
              placeholder="0.00"
              disabled={actual === ''}
            />
          </Field>
          {/* Only worth asking once there is something to send somewhere. */}
          {takingOut > 0 && !takingTooMuch && (
            <Field
              label="Where it is going"
              hint={
                destination === 'BANK'
                  ? 'Recorded on the bank ledger straight away'
                  : 'Someone is holding it — not recorded anywhere else'
              }
            >
              <Select
                value={destination}
                onChange={(e) => setDestination(e.target.value as 'BANK' | 'KEPT')}
              >
                <option value="BANK">To the bank</option>
                <option value="KEPT">Kept by someone</option>
              </Select>
            </Field>
          )}
          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Explain any variance…" />
          </Field>
        </div>

        <div className="rounded-xl bg-surface-container-low p-4">
          <dl className="space-y-2.5 text-body-sm">
            <LedgerRow label="Expected in drawer" value={currency(expected)} />
            <LedgerRow
              label="Counted"
              value={actual === '' ? '—' : currency(counted)}
              muted={actual === ''}
            />
            <div className="border-t border-outline-variant pt-2.5">
              <LedgerRow
                label="Variance"
                value={
                  actual === ''
                    ? '—'
                    : balanced
                      ? 'Balanced'
                      : `${variance! > 0 ? '+' : '−'}${currency(Math.abs(variance!))} ${variance! > 0 ? 'over' : 'short'}`
                }
                muted={actual === ''}
                tone={actual === '' ? undefined : balanced ? 'good' : 'bad'}
                strong
              />
            </div>
            {takingOut > 0 && !takingTooMuch && (
              <LedgerRow
                label={destination === 'BANK' ? 'To the bank' : 'Taken out'}
                value={`− ${currency(takingOut)}`}
              />
            )}
            <div className="border-t border-outline-variant pt-2.5">
              <LedgerRow
                label="Left in drawer"
                value={actual === '' ? '—' : currency(Math.max(0, leftInDrawer))}
                muted={actual === ''}
                strong
              />
              {/* Always shown, including when nothing is taken out: the whole
                  point is that carrying the full amount over is a visible
                  decision rather than a silent default. */}
              <p className="mt-1 text-[11px] text-on-surface-variant">
                Opens the next session
              </p>
            </div>
          </dl>
        </div>
      </div>
    </Modal>
  );
}

/** One line of the closing ledger: label left, figure right. */
function LedgerRow({
  label,
  value,
  strong,
  muted,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
  tone?: 'good' | 'bad';
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={cn('text-on-surface-variant', strong && 'font-medium text-on-surface')}>
        {label}
      </dt>
      <dd
        className={cn(
          'font-mono-data tabular-nums',
          strong ? 'font-bold' : 'font-medium',
          muted && 'text-outline',
          tone === 'good' && 'text-secondary',
          tone === 'bad' && 'text-error',
          !muted && !tone && 'text-on-surface',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function MovementModal({ sessionId, open, onClose }: { sessionId: string; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const movement = useCashMovement();
  const [type, setType] = useState<CashMovementType>('DEPOSIT');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  const submit = async () => {
    if (num(amount) <= 0) return toast.error('Enter an amount greater than zero');
    try {
      await movement.mutateAsync({ id: sessionId, type, amount: num(amount), notes: notes.trim() || undefined });
      toast.success('Movement recorded', `${type === 'DEPOSIT' ? 'Deposit' : 'Withdrawal'} ${currency(amount)}`);
      setAmount('');
      setNotes('');
      onClose();
    } catch (e) {
      toast.error('Failed', extractMessage(e));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cash Movement"
      subtitle="Record a deposit into or withdrawal from the till"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={movement.isPending}>Cancel</Button>
          <Button onClick={submit} loading={movement.isPending} icon="check">Record</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Type" required>
          <div className="grid grid-cols-2 gap-3">
            {(['DEPOSIT', 'WITHDRAWAL'] as CashMovementType[]).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-body-sm font-semibold transition-all',
                  type === t
                    ? 'border-secondary bg-secondary-container/40 text-on-secondary-container'
                    : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-low',
                )}
              >
                <Icon name={t === 'DEPOSIT' ? 'add_card' : 'remove'} size={20} />
                {t === 'DEPOSIT' ? 'Deposit' : 'Withdrawal'}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Amount" required>
          <Input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </Field>
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason for movement…" />
        </Field>
      </div>
    </Modal>
  );
}
