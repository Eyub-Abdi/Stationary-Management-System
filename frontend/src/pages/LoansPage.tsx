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
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { useIssueLoan, useLoanSummary, useLoans, useRepayLoan } from '@/hooks/useBanking';
import { useTableSort } from '@/hooks/useSort';
import { useUsers } from '@/hooks/useUsers';
import { extractMessage } from '@/lib/api';
import { PAGE_SIZE } from '@/lib/constants';
import { cn, currency, formatDate, num } from '@/lib/utils';
import type { Loan, LoanStatus, MoneyLocation } from '@/types';

export default function LoansPage() {
  const { user, isAdmin } = useAuth();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<LoanStatus | ''>('OUTSTANDING');
  const [issueOpen, setIssueOpen] = useState(false);
  const [repaying, setRepaying] = useState<Loan | null>(null);

  const { sort, onSort, params } = useTableSort({ by: 'dueDate', dir: 'asc' }, () => setPage(1));
  const loans = useLoans({
    page,
    limit: PAGE_SIZE,
    ...params,
    status: status || undefined,
  });
  const summary = useLoanSummary(isAdmin);

  return (
    <div className="flex flex-col gap-gutter">
      <PageHeader
        title={isAdmin ? 'Member Loans' : 'My Loans'}
        description={
          isAdmin
            ? 'Money members have taken or sponsored, what is still owed, and when it is due.'
            : 'Money you have taken or sponsored, and what is still to pay back.'
        }
        actions={
          isAdmin && (
            <Button icon="add" onClick={() => setIssueOpen(true)}>
              Record a Loan
            </Button>
          )
        }
      />

      {isAdmin && (
        <div className="grid grid-cols-1 gap-gutter sm:grid-cols-3">
          <StatCard
            label="Owed to the Shop"
            icon="account_balance_wallet"
            accent="primary"
            loading={summary.isLoading}
            value={currency(summary.data?.outstanding ?? 0)}
            hint={`${summary.data?.loanCount ?? 0} open ${summary.data?.loanCount === 1 ? 'loan' : 'loans'}`}
          />
          <StatCard
            label="Overdue"
            icon="schedule"
            accent="error"
            loading={summary.isLoading}
            value={currency(summary.data?.overdue ?? 0)}
            hint="Past the agreed date"
          />
          <StatCard
            label="Members Borrowing"
            icon="groups"
            accent="secondary"
            loading={summary.isLoading}
            value={summary.data?.byMember.length ?? 0}
            hint="With something still to pay"
          />
        </div>
      )}

      {/* Who owes what, before the row-by-row detail. */}
      {isAdmin && (summary.data?.byMember.length ?? 0) > 0 && (
        <Card>
          <div className="border-b border-outline-variant px-4 py-3">
            <h3 className="text-h3 font-semibold text-on-surface">By Member</h3>
          </div>
          <div className="divide-y divide-outline-variant">
            {summary.data!.byMember.map((m) => (
              <div key={m.userId} className="flex items-center justify-between px-4 py-3">
                <span className="font-medium text-on-surface">{m.fullName}</span>
                <div className="flex items-baseline gap-3">
                  {num(m.overdue) > 0 && (
                    <Badge tone="error">{currency(m.overdue)} overdue</Badge>
                  )}
                  <span className="font-mono-data font-bold tabular-nums text-on-surface">
                    {currency(m.outstanding)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <div className="flex items-center gap-3 border-b border-outline-variant p-4">
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as LoanStatus | '');
              setPage(1);
            }}
            className="sm:w-56"
          >
            <option value="OUTSTANDING">Still owed</option>
            <option value="REPAID">Fully repaid</option>
            <option value="">All loans</option>
          </Select>
        </div>

        {loans.isLoading ? (
          <LoadingState />
        ) : loans.isError ? (
          <ErrorState message={extractMessage(loans.error)} onRetry={loans.refetch} />
        ) : loans.data!.data.length === 0 ? (
          <EmptyState
            icon="account_balance_wallet"
            title={status === 'OUTSTANDING' ? 'Nothing owed' : 'No loans here'}
            description={
              isAdmin
                ? 'Money taken by a shop member will be listed here.'
                : 'You have not taken any money from the shop.'
            }
          />
        ) : (
          <>
            <Table>
              <THead sort={sort} onSort={onSort}>
                {isAdmin && <TH sortKey="user">Borrower</TH>}
                <TH sortKey="issuedAt" sortDefault="desc">Taken</TH>
                <TH sortKey="dueDate">Due</TH>
                <TH sortKey="source">From</TH>
                <TH align="right" sortKey="amount" sortDefault="desc">Amount</TH>
                {/* What is still owed is worked out from each loan's repayments,
                    so there is no stored column to order the whole list by. */}
                <TH align="right">Still owed</TH>
                {isAdmin && <TH align="center">Action</TH>}
              </THead>
              <TBody>
                {loans.data!.data.map((l) => (
                  <TR key={l.id}>
                    {isAdmin && (
                      <TD className="font-medium">
                        {l.borrowerName ? (
                          // An outsider's loan is still the member's to answer
                          // for, so both names show — who holds the money, and
                          // who the shop chases for it.
                          <span className="flex flex-col">
                            <span>
                              {l.borrowerName}
                              <Badge tone="neutral" className="ml-1.5">Guest</Badge>
                            </span>
                            <span className="text-[11px] font-normal text-on-surface-variant">
                              sponsored by {l.user.fullName}
                              {l.userId === user?.id && ' (you)'}
                            </span>
                          </span>
                        ) : (
                          <>
                            {l.user.fullName}
                            {l.userId === user?.id && (
                              <span className="ml-1.5 text-[11px] text-on-surface-variant">(you)</span>
                            )}
                          </>
                        )}
                      </TD>
                    )}
                    <TD className="whitespace-nowrap text-on-surface-variant">
                      {formatDate(l.issuedAt, 'dd MMM yyyy')}
                    </TD>
                    <TD className="whitespace-nowrap">
                      <span className={cn(l.isOverdue && 'font-semibold text-error')}>
                        {formatDate(l.dueDate, 'dd MMM yyyy')}
                      </span>
                      {l.isOverdue && (
                        <Badge tone="error" className="ml-2">Overdue</Badge>
                      )}
                    </TD>
                    <TD>
                      <Badge tone={l.source === 'BANK' ? 'navy' : 'neutral'}>
                        {l.source === 'BANK' ? 'Bank' : 'Till'}
                      </Badge>
                    </TD>
                    <TD align="right" className="font-mono-data tabular-nums text-on-surface-variant">
                      {currency(l.amount)}
                    </TD>
                    <TD align="right">
                      <span
                        className={cn(
                          'font-mono-data font-bold tabular-nums',
                          num(l.outstanding) === 0 ? 'text-secondary' : 'text-on-surface',
                        )}
                      >
                        {num(l.outstanding) === 0 ? 'Settled' : currency(l.outstanding)}
                      </span>
                    </TD>
                    {isAdmin && (
                      <TD align="center">
                        {num(l.outstanding) > 0 ? (
                          <Button variant="ghost" onClick={() => setRepaying(l)}>
                            Repay
                          </Button>
                        ) : (
                          <Icon name="check_circle" size={20} className="text-secondary" />
                        )}
                      </TD>
                    )}
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination meta={loans.data!.meta} onPage={setPage} />
          </>
        )}
      </Card>

      <IssueLoanModal open={issueOpen} onClose={() => setIssueOpen(false)} />
      <RepayModal loan={repaying} onClose={() => setRepaying(null)} />
    </div>
  );
}

function IssueLoanModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const { user } = useAuth();
  const issue = useIssueLoan();
  const { data: users } = useUsers({ limit: 100 });

  // Who is taking the money. An outsider never borrows alone — a member
  // sponsors them and the shop chases that member if it is not paid back.
  const [borrowerKind, setBorrowerKind] = useState<'member' | 'guest'>('member');
  const [borrowerName, setBorrowerName] = useState('');
  const [borrowerPhone, setBorrowerPhone] = useState('');
  const [userId, setUserId] = useState('');
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState<MoneyLocation>('HAND');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const guest = borrowerKind === 'guest';

  useEffect(() => {
    if (open) {
      setBorrowerKind('member');
      setBorrowerName('');
      setBorrowerPhone('');
      setUserId('');
      setAmount('');
      setSource('HAND');
      setDueDate('');
      setNotes('');
    }
  }, [open]);

  // Everyone active is listed, the admin recording it included: only admins can
  // issue a loan, so excluding yourself left the single-admin shop unable to
  // borrow at all, or to sponsor a guest of your own.
  const members = (users?.data ?? []).filter((u) => u.isActive);

  const submit = async () => {
    if (guest && !borrowerName.trim()) return toast.error('Name the person taking the money');
    if (!userId) {
      return toast.error(
        guest ? 'Choose the member sponsoring them' : 'Choose the member taking the money',
      );
    }
    if (num(amount) <= 0) return toast.error('Enter an amount greater than zero');
    if (!dueDate) return toast.error('Set the date it should be paid back by');
    try {
      await issue.mutateAsync({
        userId,
        borrowerName: guest ? borrowerName.trim() : undefined,
        borrowerPhone: guest ? borrowerPhone.trim() || undefined : undefined,
        amount: num(amount),
        source,
        dueDate: new Date(dueDate).toISOString(),
        notes: notes.trim() || undefined,
      });
      toast.success('Loan recorded', 'It is money owed to the shop, not an expense.');
      onClose();
    } catch (e) {
      toast.error('Could not record the loan', extractMessage(e));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Record a Loan"
      subtitle={
        guest
          ? 'Money going to someone outside the shop, against a member who answers for it'
          : 'Money a shop member is taking for themselves'
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={issue.isPending}>Cancel</Button>
          <Button onClick={submit} loading={issue.isPending} icon="check">Record Loan</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Who is taking the money" required className="sm:col-span-2">
          <SegmentedControl
            value={borrowerKind}
            onChange={(v) => setBorrowerKind(v)}
            items={[
              { value: 'member', label: 'A shop member' },
              { value: 'guest', label: 'Someone outside' },
            ]}
          />
        </Field>

        {guest && (
          <>
            <Field label="Borrower's name" required>
              <Input
                value={borrowerName}
                onChange={(e) => setBorrowerName(e.target.value)}
                placeholder="Who is taking it"
              />
            </Field>
            <Field label="Their phone" hint="Optional, but worth having">
              <Input
                value={borrowerPhone}
                onChange={(e) => setBorrowerPhone(e.target.value)}
                placeholder="07…"
              />
            </Field>
          </>
        )}

        <Field
          label={guest ? 'Sponsoring member' : 'Member'}
          required
          className="sm:col-span-2"
          hint={guest ? 'The shop chases this member if it is not paid back' : undefined}
        >
          <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Choose a shop member…</option>
            {members.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
                {u.id === user?.id ? ' (you)' : ''} — {u.role === 'ADMIN' ? 'Admin' : 'Staff'}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount" required>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </Field>
        <Field label="Taken from" required hint={source === 'HAND' ? 'The till must be open' : undefined}>
          <Select value={source} onChange={(e) => setSource(e.target.value as MoneyLocation)}>
            <option value="HAND">The till</option>
            <option value="BANK">The bank</option>
          </Select>
        </Field>
        <Field label="To be paid back by" required className="sm:col-span-2">
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What it is for, or what was agreed"
          />
        </Field>
        <p className="flex items-start gap-2 rounded-xl bg-surface-container-low px-3 py-2.5 text-[13px] text-on-surface-variant sm:col-span-2">
          <Icon name="info" size={16} className="mt-0.5 shrink-0" />
          This does not reduce profit. The shop has swapped cash for money owed by a person, and
          it shows as owed to the shop until it is paid back.
          {guest && ' A sponsored loan counts against the member who signed for it.'}
        </p>
      </div>
    </Modal>
  );
}

function RepayModal({ loan, onClose }: { loan: Loan | null; onClose: () => void }) {
  const toast = useToast();
  const repay = useRepayLoan();
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState<MoneyLocation>('HAND');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (loan) {
      setAmount(loan.outstanding);
      setDestination('HAND');
      setNotes('');
    }
  }, [loan]);

  const owed = num(loan?.outstanding ?? 0);
  const paying = num(amount);
  const tooMuch = paying > owed;
  const left = Math.max(0, owed - paying);

  const submit = async () => {
    if (!loan) return;
    if (paying <= 0) return toast.error('Enter an amount greater than zero');
    if (tooMuch) return toast.error('More than is owed', `Only ${currency(owed)} is still due.`);
    try {
      await repay.mutateAsync({
        id: loan.id,
        amount: paying,
        destination,
        notes: notes.trim() || undefined,
      });
      toast.success(
        left === 0 ? 'Loan settled' : 'Repayment recorded',
        left === 0 ? 'Nothing left to pay.' : `${currency(left)} still owed.`,
      );
      onClose();
    } catch (e) {
      toast.error('Could not record the repayment', extractMessage(e));
    }
  };

  return (
    <Modal
      open={!!loan}
      onClose={onClose}
      title="Record a Repayment"
      subtitle={
        loan
          ? `${loan.borrowerName ?? loan.user.fullName} — ${currency(owed)} still owed`
          : undefined
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={repay.isPending}>Cancel</Button>
          <Button onClick={submit} loading={repay.isPending} icon="check">Record</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field
          label="Amount paid back"
          required
          error={tooMuch ? `Only ${currency(owed)} is still owed.` : undefined}
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
        <Field label="Paid into" required hint={destination === 'HAND' ? 'The till must be open' : undefined}>
          <Select
            value={destination}
            onChange={(e) => setDestination(e.target.value as MoneyLocation)}
          >
            <option value="HAND">The till</option>
            <option value="BANK">The bank</option>
          </Select>
        </Field>
        {paying > 0 && !tooMuch && (
          <div className="flex items-center justify-between rounded-xl bg-surface-container-low px-4 py-3">
            <span className="text-body-sm text-on-surface-variant">Still owed afterwards</span>
            <span
              className={cn(
                'font-mono-data text-h3 font-bold tabular-nums',
                left === 0 ? 'text-secondary' : 'text-on-surface',
              )}
            >
              {left === 0 ? 'Settled' : currency(left)}
            </span>
          </div>
        )}
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
