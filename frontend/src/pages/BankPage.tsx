import { useEffect, useState } from 'react';
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
  useBankStatement,
  useBankSummary,
  useMoneyPosition,
  useSetOpeningBalance,
  useTransferToBank,
  useTransferToTill,
} from '@/hooks/useBanking';
import { useTableSort } from '@/hooks/useSort';
import { extractMessage } from '@/lib/api';
import { PAGE_SIZE } from '@/lib/constants';
import { cn, currency, formatDateTime, num } from '@/lib/utils';
import type { BankTransactionType } from '@/types';

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

type Dialog = 'toBank' | 'toTill' | 'opening' | 'correction' | null;

export default function BankPage() {
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialog>(null);

  const summary = useBankSummary();
  const position = useMoneyPosition();
  const { sort, onSort, params } = useTableSort({ by: 'occurredAt', dir: 'desc' }, () => setPage(1));
  const statement = useBankStatement({ page, limit: PAGE_SIZE, ...params });

  const balance = num(summary.data?.balance ?? 0);

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
            <Button icon="south_west" onClick={() => setDialog('toBank')}>
              Bank Cash
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-gutter sm:grid-cols-3">
        <StatCard
          label="At the Bank"
          icon="account_balance"
          accent="primary"
          loading={summary.isLoading}
          value={currency(balance)}
          hint={summary.data?.transactionCount ? `${summary.data.transactionCount} movements` : 'No movements yet'}
        />
        <StatCard
          label="In the Drawer"
          icon="point_of_sale"
          accent="secondary"
          loading={position.isLoading}
          value={currency(position.data?.inHand ?? 0)}
          hint={position.data?.tillOpen ? 'Till open · expected now' : 'Till closed · left at last count'}
        />
        <StatCard
          label="Held by Members"
          icon="account_balance_wallet"
          accent="error"
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

      <Card>
        <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
          <h3 className="text-h3 font-semibold text-on-surface">Statement</h3>
          <Button variant="ghost" icon="edit_note" onClick={() => setDialog('correction')}>
            Correction
          </Button>
        </div>
        {statement.isLoading ? (
          <LoadingState />
        ) : statement.isError ? (
          <ErrorState message={extractMessage(statement.error)} onRetry={statement.refetch} />
        ) : statement.data!.data.length === 0 ? (
          <EmptyState
            icon="account_balance"
            title="No bank movements yet"
            description="Bank some cash from the till and it will appear here."
          />
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
                  const meta = TX[t.type];
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
                        {t.loan ? (
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
      <OpeningBalanceModal open={dialog === 'opening'} onClose={() => setDialog(null)} />
      <CorrectionModal
        open={dialog === 'correction'}
        balance={balance}
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
          The till must be open — this moves real cash in or out of the drawer, and the
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
          hint="Negative takes money off the balance, positive adds it — e.g. −2500 for a bank charge."
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
