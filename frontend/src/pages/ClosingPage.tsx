import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Icon,
  LoadingState,
  Modal,
  PageHeader,
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
  useAccountingPeriods,
  useClosePeriod,
  useMonthlyStatement,
  useReopenPeriod,
} from '@/hooks/useAccountingPeriods';
import { extractMessage } from '@/lib/api';
import { currency, formatDate, num } from '@/lib/utils';
import type { AccountingPeriod } from '@/types';

type Target = { year: number; month: number };

export default function ClosingPage() {
  const { data, isLoading, isError, error, refetch } = useAccountingPeriods();
  const [statementFor, setStatementFor] = useState<Target | null>(null);
  const [closing, setClosing] = useState<AccountingPeriod | null>(null);
  const [reopening, setReopening] = useState<AccountingPeriod | null>(null);

  const periods = data ?? [];
  // Months must close oldest-first, so only the earliest open one is actionable.
  const nextToClose = [...periods].reverse().find((p) => !p.isClosed);
  // Likewise only the most recent closed month may be reopened.
  const latestClosed = periods.find((p) => p.isClosed);

  const closedCount = periods.filter((p) => p.isClosed).length;
  const openCount = periods.length - closedCount;
  const closedProfit = periods
    .filter((p) => p.isClosed)
    .reduce((a, p) => a + num(p.netProfit), 0);

  return (
    <div className="flex flex-col gap-gutter">
      <PageHeader
        title="Closing the Books"
        description="Sign off each finished month. Closing locks its entries so a reported profit cannot change afterwards."
      />

      <div className="grid grid-cols-1 gap-gutter sm:grid-cols-3">
        <StatCard
          label="Months Closed"
          icon="lock"
          accent="secondary"
          loading={isLoading}
          value={closedCount}
          hint={`${openCount} still open`}
        />
        <StatCard
          label="Next to Close"
          icon="event_available"
          accent="primary"
          loading={isLoading}
          value={nextToClose?.label ?? '—'}
          hint={nextToClose ? currency(nextToClose.netProfit) + ' net profit' : 'All caught up'}
        />
        <StatCard
          label="Profit in Closed Months"
          icon="verified"
          accent="tertiary"
          loading={isLoading}
          value={currency(closedProfit)}
          hint="Signed off"
        />
      </div>

      <Card>
        {isLoading ? (
          <LoadingState label="Loading months…" />
        ) : isError ? (
          <ErrorState message={extractMessage(error)} onRetry={refetch} />
        ) : periods.length === 0 ? (
          <EmptyState
            icon="event_note"
            title="No finished months yet"
            description="Once a calendar month has ended, it appears here ready to close."
          />
        ) : (
          <Table>
            <THead>
              <TH>Month</TH>
              <TH align="center">Sales</TH>
              <TH align="right">Revenue</TH>
              <TH align="right">Gross Profit</TH>
              <TH align="right">Expenses</TH>
              <TH align="right">Net Profit</TH>
              <TH>Status</TH>
              <TH align="right">Action</TH>
            </THead>
            <TBody>
              {periods.map((p) => {
                const net = num(p.netProfit);
                const canClose = !p.isClosed && nextToClose?.label === p.label;
                const canReopen = p.isClosed && latestClosed?.label === p.label;
                return (
                  <TR key={p.label} onClick={() => setStatementFor({ year: p.year, month: p.month })}>
                    <TD className="whitespace-nowrap font-medium">{p.label}</TD>
                    <TD align="center" className="font-mono-data">{p.saleCount}</TD>
                    <TD align="right" className="font-mono-data">{currency(p.revenue)}</TD>
                    <TD align="right" className="font-mono-data">{currency(p.grossProfit)}</TD>
                    <TD align="right" className="font-mono-data text-error">−{currency(p.expenses)}</TD>
                    <TD
                      align="right"
                      className={`font-mono-data font-bold ${net < 0 ? 'text-error' : 'text-on-surface'}`}
                    >
                      {net < 0 ? `−${currency(Math.abs(net))}` : currency(net)}
                    </TD>
                    <TD>
                      {p.isClosed ? (
                        <span className="flex flex-col">
                          <Badge tone="success" dot>Closed</Badge>
                          <span className="mt-0.5 text-[11px] text-on-surface-variant">
                            {p.closedBy} · {p.closedAt ? formatDate(p.closedAt) : ''}
                          </span>
                        </span>
                      ) : (
                        <Badge tone="warning">Open</Badge>
                      )}
                    </TD>
                    <TD align="right">
                      <span
                        className="flex justify-end gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {canClose && (
                          <Button icon="lock" onClick={() => setClosing(p)}>
                            Close
                          </Button>
                        )}
                        {canReopen && (
                          <Button variant="outline" icon="lock_open" onClick={() => setReopening(p)}>
                            Reopen
                          </Button>
                        )}
                        {!canClose && !canReopen && (
                          <Icon name="chevron_right" size={20} className="text-on-surface-variant" />
                        )}
                      </span>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      {periods.length > 0 && nextToClose && (
        <p className="text-body-sm text-on-surface-variant">
          <Icon name="info" size={16} className="mr-1 align-text-bottom" />
          Months close in order, oldest first — {nextToClose.label} is next.
        </p>
      )}

      <StatementModal target={statementFor} onClose={() => setStatementFor(null)} />
      <ClosePeriodModal period={closing} onClose={() => setClosing(null)} />
      <ReopenPeriodModal period={reopening} onClose={() => setReopening(null)} />
    </div>
  );
}

/** Printable monthly statement. */
function StatementModal({ target, onClose }: { target: Target | null; onClose: () => void }) {
  const { data, isLoading } = useMonthlyStatement(target);

  // A closed month reports its snapshot. If recomputing today gives a different
  // net profit, something slipped past the lock and is worth surfacing loudly.
  const drift =
    data?.isClosed && data.liveFigures && data.liveFigures.netProfit !== data.netProfit
      ? data.liveFigures
      : null;

  const rows: { label: string; value: string; strong?: boolean; negative?: boolean }[] = data
    ? [
        { label: 'Gross sales', value: currency(data.grossSales) },
        { label: 'Less refunds', value: `−${currency(data.refunds)}`, negative: true },
        { label: 'Revenue', value: currency(data.revenue), strong: true },
        { label: 'Cost of goods sold', value: `−${currency(data.cogs)}`, negative: true },
        { label: 'Gross profit', value: currency(data.grossProfit), strong: true },
        { label: 'Operating expenses', value: `−${currency(data.expenses)}`, negative: true },
        { label: 'Net profit', value: currency(data.netProfit), strong: true },
      ]
    : [];

  return (
    <Modal
      open={!!target}
      onClose={onClose}
      size="md"
      title={data ? `Statement — ${data.label}` : 'Statement'}
      subtitle={
        data?.isClosed
          ? `Closed by ${data.closedBy} on ${data.closedAt ? formatDate(data.closedAt) : ''}`
          : 'This month is still open — figures move as entries are recorded'
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button icon="print" onClick={() => window.print()}>Print</Button>
        </>
      }
    >
      {isLoading || !data ? (
        <LoadingState label="Building statement…" />
      ) : (
        <div className="space-y-4">
          {drift && (
            <div className="rounded-xl bg-error-container p-3 text-body-sm text-on-error-container">
              <p className="font-semibold">These figures have moved since the month was closed.</p>
              <p className="mt-1">
                Signed off at {currency(data.netProfit)} net profit; recomputing today gives{' '}
                {currency(drift.netProfit)}. Entries behind a closed month should be frozen — worth
                investigating in the activity log.
              </p>
            </div>
          )}

          <ul className="divide-y divide-outline-variant rounded-xl border border-outline-variant">
            {rows.map((r) => (
              <li
                key={r.label}
                className={`flex items-center justify-between px-4 py-2.5 ${
                  r.strong ? 'bg-surface-container-low' : ''
                }`}
              >
                <span className={r.strong ? 'font-semibold text-on-surface' : 'text-on-surface-variant'}>
                  {r.label}
                </span>
                <span
                  className={`font-mono-data ${r.strong ? 'font-bold' : ''} ${
                    r.negative ? 'text-error' : 'text-on-surface'
                  }`}
                >
                  {r.value}
                </span>
              </li>
            ))}
          </ul>

          <div className="grid grid-cols-2 gap-3 text-body-sm">
            <div className="rounded-xl border border-outline-variant p-3">
              <p className="text-on-surface-variant">Sales recorded</p>
              <p className="font-mono-data text-h3 font-bold">{data.saleCount}</p>
            </div>
            <div className="rounded-xl border border-outline-variant p-3">
              <p className="text-on-surface-variant">Stock purchased</p>
              <p className="font-mono-data text-h3 font-bold">{currency(data.purchases)}</p>
            </div>
          </div>

          {data.notes && (
            <div className="rounded-xl bg-surface-container-low p-3 text-body-sm">
              <p className="font-semibold text-on-surface">Note at close</p>
              <p className="mt-1 text-on-surface-variant">{data.notes}</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function ClosePeriodModal({
  period,
  onClose,
}: {
  period: AccountingPeriod | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const close = useClosePeriod();
  const [notes, setNotes] = useState('');

  const submit = async () => {
    if (!period) return;
    try {
      await close.mutateAsync({
        year: period.year,
        month: period.month,
        notes: notes.trim() || undefined,
      });
      toast.success(`${period.label} closed`, 'Its entries are now locked.');
      setNotes('');
      onClose();
    } catch (e) {
      toast.error('Failed to close the month', extractMessage(e));
    }
  };

  return (
    <Modal
      open={!!period}
      onClose={onClose}
      size="sm"
      title={period ? `Close ${period.label}?` : 'Close month'}
      subtitle="Check the figures before signing off"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={close.isPending}>Cancel</Button>
          <Button icon="lock" loading={close.isPending} onClick={submit}>Close Month</Button>
        </>
      }
    >
      {period && (
        <div className="space-y-4">
          <ul className="divide-y divide-outline-variant rounded-xl border border-outline-variant">
            <li className="flex justify-between px-4 py-2.5">
              <span className="text-on-surface-variant">Revenue</span>
              <span className="font-mono-data">{currency(period.revenue)}</span>
            </li>
            <li className="flex justify-between px-4 py-2.5">
              <span className="text-on-surface-variant">Expenses</span>
              <span className="font-mono-data text-error">−{currency(period.expenses)}</span>
            </li>
            <li className="flex justify-between bg-surface-container-low px-4 py-2.5">
              <span className="font-semibold text-on-surface">Net profit</span>
              <span className="font-mono-data font-bold">{currency(period.netProfit)}</span>
            </li>
          </ul>

          <p className="text-body-sm text-on-surface-variant">
            After closing, expenses, sale voids and backdated purchases in {period.label} are
            blocked. You can reopen the month if a correction is needed.
          </p>

          <Field label="Note (optional)">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. reviewed against bank statement"
            />
          </Field>
        </div>
      )}
    </Modal>
  );
}

function ReopenPeriodModal({
  period,
  onClose,
}: {
  period: AccountingPeriod | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const reopen = useReopenPeriod();
  const [reason, setReason] = useState('');

  const submit = async () => {
    if (!period) return;
    if (!reason.trim()) return toast.error('Reason required', 'Say why the month is reopening.');
    try {
      await reopen.mutateAsync({
        year: period.year,
        month: period.month,
        reason: reason.trim(),
      });
      toast.success(`${period.label} reopened`, 'Corrections can now be made.');
      setReason('');
      onClose();
    } catch (e) {
      toast.error('Failed to reopen the month', extractMessage(e));
    }
  };

  return (
    <Modal
      open={!!period}
      onClose={onClose}
      size="sm"
      title={period ? `Reopen ${period.label}?` : 'Reopen month'}
      subtitle="The reason is recorded in the activity log"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={reopen.isPending}>Cancel</Button>
          <Button variant="danger" icon="lock_open" loading={reopen.isPending} onClick={submit}>
            Reopen Month
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-body-sm text-on-surface-variant">
          Its entries become editable again, so the figures you signed off may change. The original
          snapshot is kept until the month is closed again.
        </p>
        <Field label="Reason" required>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. a supplier invoice arrived late"
          />
        </Field>
      </div>
    </Modal>
  );
}
