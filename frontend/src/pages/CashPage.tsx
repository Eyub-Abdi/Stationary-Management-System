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
import { extractMessage } from '@/lib/api';
import { cn, currency, formatDateTime, num } from '@/lib/utils';
import type { CashMovementType, CashSession } from '@/types';

type TabKey = 'sessions' | 'variances';

export default function CashPage() {
  const { isAdmin } = useAuth();
  const { session, isLoading: sessionLoading, setActiveId } = useActiveCashSession();
  const [tab, setTab] = useState<TabKey>('sessions');
  const [openModal, setOpenModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [moveModal, setMoveModal] = useState(false);

  return (
    <div className="flex flex-col gap-gutter">
      <PageHeader
        title="Cash Management"
        description="Open and reconcile daily cash sessions, and track till movements."
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
            title="No open cash session"
            description="Open a session at the start of your shift to record sales and reconcile cash."
            action={<Button icon="lock_open" onClick={() => setOpenModal(true)}>Open Cash Session</Button>}
          />
        </Card>
      )}

      {isAdmin && (
        <>
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { value: 'sessions', label: 'All Sessions', icon: 'history' },
              { value: 'variances', label: 'Variances', icon: 'rule' },
            ]}
          />
          {tab === 'sessions' ? <SessionsTable onResume={setActiveId} /> : <VariancesTable />}
        </>
      )}

      <OpenSessionModal open={openModal} onClose={() => setOpenModal(false)} onOpened={setActiveId} />
      {session && (
        <>
          <CloseSessionModal session={session} open={closeModal} onClose={() => setCloseModal(false)} onClosed={() => setActiveId(null)} />
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
          title="Active Session"
          subtitle={`Opened ${formatDateTime(session.openedAt)} · ${session.user?.fullName ?? ''}`}
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

function SessionsTable({ onResume }: { onResume: (id: string) => void }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch, error } = useCashSessions({ page, limit: 10 });
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
            <THead>
              <TH>Opened</TH>
              <TH>Cashier</TH>
              <TH align="center">Status</TH>
              <TH align="right">Opening</TH>
              <TH align="right">Expected</TH>
              <TH align="right">Actual</TH>
              <TH align="right">Variance</TH>
              <TH align="right" />
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
                  <TD align="right">
                    {s.status === 'OPEN' && (
                      <Button size="sm" variant="ghost" onClick={() => onResume(s.id)}>Resume</Button>
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
  );
}

function VariancesTable() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch, error } = useCashVariances({ page, limit: 10 });
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
            <THead>
              <TH>Closed</TH>
              <TH>Cashier</TH>
              <TH align="right">Expected</TH>
              <TH align="right">Actual</TH>
              <TH align="right">Variance</TH>
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

function OpenSessionModal({
  open,
  onClose,
  onOpened,
}: {
  open: boolean;
  onClose: () => void;
  onOpened: (id: string) => void;
}) {
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
      onOpened(s.id);
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
          ? 'The float is carried over from your last shift’s closing count'
          : 'Count the cash in the drawer to start your first shift'
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
          <p className="flex items-center gap-1.5 text-[12px] text-on-surface-variant">
            <Icon name="info" size={16} /> No need to recount — this is the cash left in the drawer at the last close.
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
  onClosed,
}: {
  session: CashSession;
  open: boolean;
  onClose: () => void;
  onClosed: () => void;
}) {
  const toast = useToast();
  const closeSession = useCloseCashSession();
  const [actual, setActual] = useState('');
  const [notes, setNotes] = useState('');

  const expected = num(session.breakdown?.expectedAmount ?? 0);
  const variance = actual === '' ? null : num(actual) - expected;

  const submit = async () => {
    if (actual === '' || num(actual) < 0) return toast.error('Enter the counted cash amount');
    try {
      await closeSession.mutateAsync({ id: session.id, actualAmount: num(actual), notes: notes.trim() || undefined });
      toast.success('Session closed', variance === 0 ? 'Drawer balanced perfectly.' : `Variance ${currency(variance ?? 0)}`);
      onClosed();
      onClose();
    } catch (e) {
      toast.error('Could not close session', extractMessage(e));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Close Cash Session"
      subtitle="Count the physical cash and reconcile against expected"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={closeSession.isPending}>Cancel</Button>
          <Button onClick={submit} loading={closeSession.isPending} icon="lock">Close & Reconcile</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl bg-surface-container-low px-4 py-3">
          <span className="text-body-sm text-on-surface-variant">Expected in drawer</span>
          <span className="font-mono-data text-h3 font-bold text-primary">{currency(expected)}</span>
        </div>
        <Field label="Actual counted cash" required>
          <Input type="number" min="0" step="0.01" value={actual} onChange={(e) => setActual(e.target.value)} placeholder="0.00" autoFocus />
        </Field>
        {variance !== null && (
          <div className={cn(
            'flex items-center justify-between rounded-xl px-4 py-3',
            variance === 0 ? 'bg-secondary-container/50 text-on-secondary-container' : 'bg-error-container/50 text-on-error-container',
          )}>
            <span className="text-body-sm font-semibold">Variance</span>
            <span className="font-mono-data font-bold">
              {variance > 0 ? '+' : ''}{currency(variance)} {variance === 0 ? '' : variance > 0 ? '(over)' : '(short)'}
            </span>
          </div>
        )}
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Explain any variance…" />
        </Field>
      </div>
    </Modal>
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
