import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  SegmentedControl,
  EmptyState,
  ErrorState,
  Field,
  Icon,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Pagination,
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
import {
  useBankCorrection,
  useBankHeldCash,
  useBankStatement,
  useBankSummary,
  useHandCorrection,
  useHandStatement,
  useHandSummary,
  useMoneyPosition,
  useReturnHeldCashToTill,
  useSetHandOpeningBalance,
  useSetOpeningBalance,
  useTransferToBank,
  useTransferToTill,
} from '@/hooks/useBanking';
import { useTableSort } from '@/hooks/useSort';
import { extractMessage } from '@/lib/api';
import { PAGE_SIZE } from '@/lib/constants';
import { cn, currency, formatDate, formatDateTime, num } from '@/lib/utils';
import type { BankTransactionType, HandTransactionType } from '@/types';

/** How each ledger row reads to someone scanning the statement. */
const TX: Record<BankTransactionType, { label: string; icon: string }> = {
  OPENING_BALANCE: { label: 'Opening balance', icon: 'flag' },
  TRANSFER_IN: { label: 'Cash banked', icon: 'south_west' },
  TRANSFER_OUT: { label: 'Drawn to till', icon: 'north_east' },
  LOAN_OUT: { label: 'Lent to member', icon: 'person_remove' },
  LOAN_REPAYMENT: { label: 'Repayment', icon: 'person_add' },
  CHARGE: { label: 'Bank charge', icon: 'receipt' },
  CORRECTION: { label: 'Correction', icon: 'edit_note' },
};

/** The same, for the held-cash ledger. */
const HAND_TX: Record<HandTransactionType, { label: string; icon: string }> = {
  OPENING_BALANCE: { label: 'Opening figure', icon: 'flag' },
  FROM_TILL: { label: 'Kept from till', icon: 'south_west' },
  TO_BANK: { label: 'Deposited at bank', icon: 'account_balance' },
  TO_TILL: { label: 'Back to till', icon: 'north_east' },
  SPENT: { label: 'Spent on a bill', icon: 'payments' },
  CORRECTION: { label: 'Correction', icon: 'edit_note' },
};

type Dialog =
  | 'toBank'
  | 'toTill'
  | 'opening'
  | 'correction'
  | 'depositHeld'
  | 'heldToTill'
  | 'handOpening'
  | 'handCorrection'
  | null;

/** Which ledger the statement card is showing. */
type Ledger = 'bank' | 'hand';

export default function BankPage() {
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialog>(null);

  const [ledger, setLedger] = useState<Ledger>('bank');

  const summary = useBankSummary();
  const handSummary = useHandSummary();
  const position = useMoneyPosition();
  const { sort, onSort, params } = useTableSort({ by: 'occurredAt', dir: 'desc' }, () => setPage(1));
  const query = { page, limit: PAGE_SIZE, ...params };
  // Both are fetched; only the chosen one is rendered. They are small, and the
  // card switches without a spinner.
  const bankStatement = useBankStatement(query);
  const handStatement = useHandStatement(query);
  const statement = ledger === 'bank' ? bankStatement : handStatement;

  const balance = num(summary.data?.balance ?? 0);
  const held = num(handSummary.data?.balance ?? 0);

  return (
    <div className="flex flex-col gap-gutter">
      <PageHeader
        title="Bank"
        description="Money the shop holds away from the counter, and every movement in and out."
        actions={
          <>
            <Button variant="outline" icon="north_east" onClick={() => setDialog('toTill')}>
              Draw to Till
            </Button>
            {/* The weekly trip. Only offered when there is something to take:
                this money is not in the drawer, so "Bank Cash" cannot move it. */}
            {held > 0 && (
              <Button variant="outline" icon="account_balance" onClick={() => setDialog('depositHeld')}>
                Deposit Held Cash
              </Button>
            )}
            <Button icon="south_west" onClick={() => setDialog('toBank')}>
              Bank Cash
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-gutter sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="At the Bank"
          icon="account_balance"
          accent="blue"
          loading={summary.isLoading}
          value={currency(balance)}
          hint={summary.data?.transactionCount ? `${summary.data.transactionCount} movements` : 'No movements yet'}
        />
        <StatCard
          label="In the Drawer"
          icon="point_of_sale"
          accent="emerald"
          loading={position.isLoading}
          value={currency(position.data?.inHand ?? 0)}
          hint={position.data?.tillOpen ? 'Till open · expected now' : 'Till closed · left at last count'}
        />
        {/* Out of the drawer, not yet at the bank. Its own place because it is
            neither, and because until it was tracked the money simply
            disappeared from this row. */}
        <StatCard
          label="Held On Hand"
          icon="wallet"
          accent="orange"
          loading={handSummary.isLoading}
          value={currency(held)}
          hint={
            handSummary.data?.heldSince
              ? `Since ${formatDate(handSummary.data.heldSince)} · not yet banked`
              : 'Nothing held outside the till'
          }
        />
        <StatCard
          label="Held by Members"
          icon="account_balance_wallet"
          accent="amber"
          loading={position.isLoading}
          value={currency(position.data?.owedByMembers ?? 0)}
          hint={
            num(position.data?.overdueFromMembers ?? 0) > 0
              ? `${currency(position.data!.overdueFromMembers)} overdue`
              : 'Nothing overdue'
          }
        />
      </div>

      {/* Until the real starting figure is recorded the balance only counts what
          the app has seen, which is rarely what the bank actually holds. */}
      {summary.data && !summary.data.openingBalanceSet && (
        <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Icon name="info" size={20} className="mt-0.5 shrink-0 text-primary" />
            <div>
              <p className="text-body-sm font-semibold text-on-surface">
                This balance starts from zero
              </p>
              <p className="text-[13px] text-on-surface-variant">
                Record what is in the account today and every movement after it counts from there.
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={() => setDialog('opening')}>
            Set Opening Balance
          </Button>
        </Card>
      )}

      {/* Same problem on the held side: cash the shop was already keeping before
          this ledger existed is invisible until someone says how much. */}
      {handSummary.data && !handSummary.data.openingBalanceSet && held === 0 && (
        <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Icon name="info" size={20} className="mt-0.5 shrink-0 text-primary" />
            <div>
              <p className="text-body-sm font-semibold text-on-surface">
                Already holding cash outside the till?
              </p>
              <p className="text-[13px] text-on-surface-variant">
                Record what is being held today. From then on every close that keeps cash on hand
                adds to it, and every bank trip takes it away.
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={() => setDialog('handOpening')}>
            Set Held Figure
          </Button>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant px-4 py-3">
          <SegmentedControl
            value={ledger}
            onChange={(v) => {
              setLedger(v);
              setPage(1);
            }}
            items={[
              { value: 'bank', label: 'Bank' },
              { value: 'hand', label: 'Held cash' },
            ]}
          />
          <div className="flex items-center gap-1">
            {ledger === 'hand' && held > 0 && (
              <Button variant="ghost" icon="north_east" onClick={() => setDialog('heldToTill')}>
                Back to Till
              </Button>
            )}
            <Button
              variant="ghost"
              icon="edit_note"
              onClick={() => setDialog(ledger === 'bank' ? 'correction' : 'handCorrection')}
            >
              Correction
            </Button>
          </div>
        </div>
        {statement.isLoading ? (
          <LoadingState />
        ) : statement.isError ? (
          <ErrorState message={extractMessage(statement.error)} onRetry={statement.refetch} />
        ) : statement.data!.data.length === 0 ? (
          ledger === 'bank' ? (
            <EmptyState
              icon="account_balance"
              title="No bank movements yet"
              description="Bank some cash from the till and it will appear here."
            />
          ) : (
            <EmptyState
              icon="wallet"
              title="No cash held outside the till"
              description="Close the till keeping some cash on hand and it will appear here, waiting for the bank trip."
            />
          )
        ) : (
          <>
            <Table>
              <THead sort={sort} onSort={onSort}>
                <TH sortKey="occurredAt" sortDefault="desc">Date</TH>
                <TH sortKey="type">Movement</TH>
                {/* Details is a note on some rows and a borrower on others —
                    one column, two sources, nothing to order it by. */}
                <TH>Details</TH>
                <TH sortKey="user">By</TH>
                <TH align="right" sortKey="amount" sortDefault="desc">Amount</TH>
              </THead>
              <TBody>
                {statement.data!.data.map((t) => {
                  const meta =
                    ledger === 'bank'
                      ? TX[t.type as BankTransactionType]
                      : HAND_TX[t.type as HandTransactionType];
                  const inflow = num(t.amount) >= 0;
                  return (
                    <TR key={t.id}>
                      <TD className="whitespace-nowrap text-on-surface-variant">
                        {formatDateTime(t.occurredAt)}
                      </TD>
                      <TD>
                        <span className="flex items-center gap-2 font-medium">
                          <Icon name={meta.icon} size={18} className="text-on-surface-variant" />
                          {meta.label}
                        </span>
                      </TD>
                      <TD className="text-on-surface-variant">
                        {'loan' in t && t.loan ? (
                          <Badge tone="warning">{t.loan.user.fullName}</Badge>
                        ) : (
                          t.notes || '—'
                        )}
                      </TD>
                      <TD className="text-on-surface-variant">{t.user?.fullName ?? '—'}</TD>
                      <TD align="right">
                        <span
                          className={cn(
                            'font-mono-data font-bold tabular-nums',
                            inflow ? 'text-secondary' : 'text-error',
                          )}
                        >
                          {inflow ? '+' : '−'}
                          {currency(Math.abs(num(t.amount)))}
                        </span>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            <Pagination meta={statement.data!.meta} onPage={setPage} />
          </>
        )}
      </Card>

      <MoveMoneyModal
        kind={dialog === 'toBank' ? 'toBank' : dialog === 'toTill' ? 'toTill' : null}
        balance={balance}
        onClose={() => setDialog(null)}
      />
      <HeldCashModal
        kind={
          dialog === 'depositHeld' ? 'toBank' : dialog === 'heldToTill' ? 'toTill' : null
        }
        held={held}
        onClose={() => setDialog(null)}
      />
      <OpeningBalanceModal open={dialog === 'opening'} onClose={() => setDialog(null)} />
      <HandOpeningBalanceModal
        open={dialog === 'handOpening'}
        onClose={() => setDialog(null)}
      />
      <CorrectionModal
        open={dialog === 'correction'}
        balance={balance}
        onClose={() => setDialog(null)}
      />
      <HandCorrectionModal
        open={dialog === 'handCorrection'}
        held={held}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}

/** Both directions of a transfer are the same form; only the words differ. */
function MoveMoneyModal({
  kind,
  balance,
  onClose,
}: {
  kind: 'toBank' | 'toTill' | null;
  balance: number;
  onClose: () => void;
}) {
  const toast = useToast();
  const toBank = useTransferToBank();
  const toTill = useTransferToTill();
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (kind) {
      setAmount('');
      setNotes('');
    }
  }, [kind]);

  const banking = kind === 'toBank';
  const mutation = banking ? toBank : toTill;
  const overdrawn = !banking && num(amount) > balance;

  const submit = async () => {
    if (num(amount) <= 0) return toast.error('Enter an amount greater than zero');
    if (overdrawn) return toast.error('More than the bank holds', `The balance is ${currency(balance)}.`);
    try {
      await mutation.mutateAsync({ amount: num(amount), notes: notes.trim() || undefined });
      toast.success(
        banking ? 'Cash banked' : 'Cash drawn',
        `${currency(num(amount))} moved ${banking ? 'to the bank' : 'into the till'}.`,
      );
      onClose();
    } catch (e) {
      toast.error('Could not move the money', extractMessage(e));
    }
  };

  return (
    <Modal
      open={!!kind}
      onClose={onClose}
      title={banking ? 'Bank Cash' : 'Draw Cash to Till'}
      subtitle={
        banking
          ? 'Takes the cash out of the drawer and adds it to the bank'
          : 'Takes it off the bank balance and puts it in the drawer'
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button onClick={submit} loading={mutation.isPending} icon="check">
            {banking ? 'Bank It' : 'Draw It'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* The till must be open either way: the drawer side of the move is a
            cash movement, and there is no drawer to move it to or from. */}
        <p className="flex items-start gap-2 rounded-xl bg-surface-container-low px-3 py-2.5 text-[13px] text-on-surface-variant">
          <Icon name="info" size={16} className="mt-0.5 shrink-0" />
          The till must be open. This moves real cash in or out of the drawer, and the
          day&rsquo;s count has to know about it.
        </p>
        <Field
          label="Amount"
          required
          error={overdrawn ? `The bank only holds ${currency(balance)}.` : undefined}
        >
          <Input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            autoFocus
          />
        </Field>
        <Field label="Notes" hint={banking ? 'e.g. deposit slip number' : 'e.g. what it is for'}>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function OpeningBalanceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const setOpening = useSetOpeningBalance();
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (open) setAmount('');
  }, [open]);

  const submit = async () => {
    if (amount === '' || num(amount) < 0) return toast.error('Enter the amount in the account');
    try {
      await setOpening.mutateAsync({ amount: num(amount), notes: 'Opening balance' });
      toast.success('Opening balance recorded', 'The bank balance now starts from this figure.');
      onClose();
    } catch (e) {
      toast.error('Could not record it', extractMessage(e));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Set Opening Balance"
      subtitle="What is in the bank account today"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={setOpening.isPending}>Cancel</Button>
          <Button onClick={submit} loading={setOpening.isPending} icon="check">Record</Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="flex items-start gap-2 rounded-xl bg-surface-container-low px-3 py-2.5 text-[13px] text-on-surface-variant">
          <Icon name="info" size={16} className="mt-0.5 shrink-0" />
          Recorded once. Afterwards the balance only changes through movements, so use a
          correction if it ever needs adjusting against a statement.
        </p>
        <Field label="Amount in the account" required>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            autoFocus
          />
        </Field>
      </div>
    </Modal>
  );
}

function CorrectionModal({
  open,
  balance,
  onClose,
}: {
  open: boolean;
  balance: number;
  onClose: () => void;
}) {
  const toast = useToast();
  const correct = useBankCorrection();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) {
      setAmount('');
      setReason('');
    }
  }, [open]);

  const delta = num(amount);
  const after = balance + delta;

  const submit = async () => {
    if (delta === 0) return toast.error('A correction of zero changes nothing');
    if (!reason.trim()) return toast.error('Give a reason for the correction');
    try {
      await correct.mutateAsync({ amount: delta, reason: reason.trim() });
      toast.success('Balance corrected', `Now ${currency(after)}.`);
      onClose();
    } catch (e) {
      toast.error('Could not correct it', extractMessage(e));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Correct the Balance"
      subtitle="After checking the account against a statement"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={correct.isPending}>Cancel</Button>
          <Button onClick={submit} loading={correct.isPending} icon="check">Apply</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field
          label="Adjustment"
          required
          hint="Negative takes money off the balance, positive adds it. For example, −2500 for a bank charge."
        >
          <Input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            autoFocus
          />
        </Field>
        {amount !== '' && delta !== 0 && (
          <div className="flex items-center justify-between rounded-xl bg-surface-container-low px-4 py-3">
            <span className="text-body-sm text-on-surface-variant">Balance afterwards</span>
            <span
              className={cn(
                'font-mono-data text-h3 font-bold tabular-nums',
                after < 0 ? 'text-error' : 'text-on-surface',
              )}
            >
              {currency(after)}
            </span>
          </div>
        )}
        <Field label="Reason" required>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Monthly account fee shown on the statement"
          />
        </Field>
      </div>
    </Modal>
  );
}

/**
 * Moving the cash the shop is holding. Both directions are the same form, as
 * with the bank transfers — but the bank direction here is the one that had no
 * home before: it does NOT touch the till, because the money left the drawer
 * days ago and putting a withdrawal on today's session would invent a shortage.
 */
function HeldCashModal({
  kind,
  held,
  onClose,
}: {
  kind: 'toBank' | 'toTill' | null;
  held: number;
  onClose: () => void;
}) {
  const toast = useToast();
  const deposit = useBankHeldCash();
  const toTill = useReturnHeldCashToTill();
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    // Almost always the whole lot goes to the bank, so that is what it opens on.
    if (kind) {
      setAmount(kind === 'toBank' ? String(held) : '');
      setNotes('');
    }
  }, [kind, held]);

  const banking = kind === 'toBank';
  const mutation = banking ? deposit : toTill;
  const tooMuch = num(amount) > held;

  const submit = async () => {
    if (num(amount) <= 0) return toast.error('Enter an amount greater than zero');
    if (tooMuch) {
      return toast.error('More than is held', `Only ${currency(held)} is being held.`);
    }
    try {
      await mutation.mutateAsync({ amount: num(amount), notes: notes.trim() || undefined });
      toast.success(
        banking ? 'Held cash deposited' : 'Cash back in the till',
        `${currency(num(amount))} moved ${banking ? 'to the bank' : 'into the drawer'}.`,
      );
      onClose();
    } catch (e) {
      toast.error('Could not move the money', extractMessage(e));
    }
  };

  return (
    <Modal
      open={!!kind}
      onClose={onClose}
      title={banking ? 'Deposit Held Cash' : 'Return Held Cash to Till'}
      subtitle={
        banking
          ? 'The bank trip — takings kept at the shop, finally paid in'
          : 'Puts held cash back into the drawer as a deposit'
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={mutation.isPending} icon="check">
            {banking ? 'Deposit It' : 'Return It'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="flex items-start gap-2 rounded-xl bg-surface-container-low px-3 py-2.5 text-[13px] text-on-surface-variant">
          <Icon name="info" size={16} className="mt-0.5 shrink-0" />
          {banking ? (
            <>
              The till is not involved — this money left the drawer when the session was closed,
              so no count changes. It moves from held cash to the bank.
            </>
          ) : (
            <>
              The till must be open. This puts real cash back in the drawer, and the day&rsquo;s
              count has to know about it.
            </>
          )}
        </p>
        <div className="flex items-baseline justify-between rounded-xl bg-surface-container-low px-3 py-2.5">
          <span className="text-body-sm text-on-surface-variant">Currently held</span>
          <span className="font-mono-data font-bold text-on-surface">{currency(held)}</span>
        </div>
        <Field
          label="Amount"
          required
          error={tooMuch ? `Only ${currency(held)} is being held.` : undefined}
        >
          <Input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            autoFocus
          />
        </Field>
        <Field label="Notes" hint={banking ? 'e.g. deposit slip number' : 'e.g. what it is for'}>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function HandOpeningBalanceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const setOpening = useSetHandOpeningBalance();
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (open) setAmount('');
  }, [open]);

  const submit = async () => {
    if (amount === '' || num(amount) < 0) return toast.error('Enter the amount being held');
    try {
      await setOpening.mutateAsync({ amount: num(amount), notes: 'Opening held figure' });
      toast.success('Held figure recorded', 'Held cash now starts from this amount.');
      onClose();
    } catch (e) {
      toast.error('Could not record it', extractMessage(e));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cash Already Held"
      subtitle="Recorded once — everything after it is a movement"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={setOpening.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={setOpening.isPending} icon="check">
            Record It
          </Button>
        </>
      }
    >
      <Field label="Amount being held outside the till today" required>
        <Input
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          autoFocus
        />
      </Field>
    </Modal>
  );
}

function HandCorrectionModal({
  open,
  held,
  onClose,
}: {
  open: boolean;
  held: number;
  onClose: () => void;
}) {
  const toast = useToast();
  const correct = useHandCorrection();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) {
      setAmount('');
      setReason('');
    }
  }, [open]);

  const delta = num(amount);
  const after = held + delta;

  const submit = async () => {
    if (delta === 0) return toast.error('A correction of zero changes nothing');
    if (!reason.trim()) return toast.error('Say why the figure was wrong');
    if (after < 0) {
      return toast.error('That would go below zero', `Only ${currency(held)} is being held.`);
    }
    try {
      await correct.mutateAsync({ amount: delta, reason: reason.trim() });
      toast.success('Correction recorded', `Held cash is now ${currency(after)}.`);
      onClose();
    } catch (e) {
      toast.error('Could not record it', extractMessage(e));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Correct Held Cash"
      subtitle="After counting what is actually being held"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={correct.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={correct.isPending} icon="check">
            Record Correction
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field
          label="Adjustment"
          required
          hint="Negative takes money off the figure, positive adds to it"
          error={after < 0 ? `Only ${currency(held)} is being held.` : undefined}
        >
          <Input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. -2500"
            autoFocus
          />
        </Field>
        {delta !== 0 && after >= 0 && (
          <p className="text-body-sm text-on-surface-variant">
            Held cash becomes{' '}
            <span className="font-mono-data font-bold text-on-surface">{currency(after)}</span>.
          </p>
        )}
        <Field label="Reason" required>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. counted the safe, 2,500 less than recorded"
          />
        </Field>
      </div>
    </Modal>
  );
}
