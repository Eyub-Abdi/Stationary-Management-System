import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Card,
  EmptyState,
  ErrorState,
  Icon,
  LoadingState,
  PageHeader,
  Pagination,
  Select,
} from '@/components/ui';
import { docPath, type DocKind } from '@/components/DocLink';
import { useAuditLogs } from '@/hooks/useAudit';
import { extractMessage } from '@/lib/api';
import { cn, currency, formatDateTime, humanize, initials, num } from '@/lib/utils';
import type { AuditLog } from '@/types';

/** Friendly activity categories — mapped to the backend's entityType filter. */
const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: 'Sale', label: 'Sales & refunds' },
  { value: 'Product', label: 'Products & stock' },
  { value: 'Service', label: 'Services' },
  { value: 'Purchase', label: 'Purchases' },
  { value: 'Expense', label: 'Expenses' },
  { value: 'CashSession', label: 'Cash drawer' },
  { value: 'Customer', label: 'Customer payments' },
  { value: 'Supplier', label: 'Supplier payments' },
  { value: 'User', label: 'Staff & sign-ins' },
];

type Color = 'green' | 'red' | 'amber' | 'blue' | 'violet' | 'indigo' | 'teal' | 'slate';

// Tinted backgrounds + readable icon colors that hold up in light and dark.
const PALETTE: Record<Color, string> = {
  green: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  red: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  amber: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  blue: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  violet: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  indigo: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
  teal: 'bg-teal-500/15 text-teal-600 dark:text-teal-400',
  slate: 'bg-slate-500/15 text-slate-600 dark:text-slate-400',
};

interface Described {
  title: string;
  detail: string | null;
  icon: string;
  color: Color;
}

/**
 * Turns a raw audit row into a plain-language story a shop owner can read at a
 * glance — no codes, ids, or JSON. Falls back gracefully when metadata is thin.
 */
function describe(log: AuditLog): Described {
  const m = (log.metadata ?? {}) as Record<string, any>;
  const money = (v: unknown) => currency(v as string | number | null | undefined);

  switch (log.action) {
    case 'SALE_CREATED': {
      const parts = [
        m.invoiceNumber && `Invoice ${m.invoiceNumber}`,
        m.itemCount != null && `${m.itemCount} item${m.itemCount === 1 ? '' : 's'}`,
        m.total != null && money(m.total),
        m.paymentMethod && `paid by ${humanize(m.paymentMethod).toLowerCase()}`,
        num(m.amountDue) > 0 && `${money(m.amountDue)} on credit`,
      ].filter(Boolean);
      return { title: 'Sale recorded', detail: parts.join(' · '), icon: 'point_of_sale', color: 'green' };
    }
    case 'SALE_VOIDED':
      return {
        title: 'Sale cancelled',
        detail: [m.invoiceNumber && `Invoice ${m.invoiceNumber}`, m.reason && `Reason: ${m.reason}`].filter(Boolean).join(' · ') || null,
        icon: 'cancel',
        color: 'red',
      };
    case 'SALE_RETURNED':
      return {
        title: 'Sale returned & refunded',
        detail: [m.returnNumber, m.totalRefund != null && `Refunded ${money(m.totalRefund)}`, m.reason].filter(Boolean).join(' · ') || null,
        icon: 'assignment_return',
        color: 'amber',
      };
    case 'CUSTOMER_PAYMENT':
      return {
        title: 'Customer paid their debt',
        detail: [
          m.amount != null && `Received ${money(m.amount)}`,
          m.invoicesSettled && `${m.invoicesSettled} invoice${m.invoicesSettled === 1 ? '' : 's'} settled`,
          m.newBalance != null && `${money(m.newBalance)} still owed`,
        ].filter(Boolean).join(' · ') || null,
        icon: 'savings',
        color: 'blue',
      };
    case 'SUPPLIER_PAYMENT':
      return {
        title: 'Paid a supplier',
        detail: [m.amount != null && `Paid ${money(m.amount)}`, m.newBalance != null && `${money(m.newBalance)} still owed`].filter(Boolean).join(' · ') || null,
        icon: 'local_shipping',
        color: 'amber',
      };
    // Categories are user-managed rows now, so their names are already
    // display-ready — no humanize().
    case 'EXPENSE_CREATED':
      return {
        title: 'Expense recorded',
        detail: [m.category, m.amount != null && money(m.amount)].filter(Boolean).join(' · ') || null,
        icon: 'receipt_long',
        color: 'amber',
      };
    case 'EXPENSE_UPDATED':
      return {
        title: 'Expense edited',
        detail:
          [
            m.before?.category,
            m.before?.amount != null && money(m.before.amount),
            m.after?.amount != null && `→ ${money(m.after.amount)}`,
          ]
            .filter(Boolean)
            .join(' · ') || null,
        icon: 'edit',
        color: 'amber',
      };
    case 'EXPENSE_DELETED':
      return {
        title: 'Expense deleted',
        detail: [m.category, m.amount != null && money(m.amount)].filter(Boolean).join(' · ') || null,
        icon: 'delete',
        color: 'red',
      };
    case 'PERIOD_CLOSED':
      return {
        title: 'Closed the books',
        detail:
          [m.period, m.netProfit != null && `${money(m.netProfit)} net profit`]
            .filter(Boolean)
            .join(' · ') || null,
        icon: 'lock',
        color: 'green',
      };
    case 'PERIOD_REOPENED':
      return {
        title: 'Reopened a closed month',
        detail: [m.period, m.reason].filter(Boolean).join(' · ') || null,
        icon: 'lock_open',
        color: 'red',
      };
    case 'EXPENSE_CATEGORY_CREATED':
      return {
        title: 'Expense category created',
        detail: m.name ?? null,
        icon: 'category',
        color: 'blue',
      };
    case 'EXPENSE_CATEGORY_UPDATED':
      return {
        title: 'Expense category updated',
        detail:
          [m.name, m.isActive === false && 'archived'].filter(Boolean).join(' · ') || null,
        icon: 'category',
        color: 'blue',
      };
    case 'EXPENSE_CATEGORY_DELETED':
      return {
        title: 'Expense category deleted',
        detail: m.name ?? null,
        icon: 'category',
        color: 'red',
      };
    case 'PURCHASE_CREATED':
      return {
        title: 'Stock purchased',
        detail: [
          m.purchaseNumber,
          m.lineCount != null && `${m.lineCount} item${m.lineCount === 1 ? '' : 's'}`,
          m.totalCost != null && money(m.totalCost),
          num(m.amountDue) > 0 && `${money(m.amountDue)} on credit`,
        ].filter(Boolean).join(' · ') || null,
        icon: 'shopping_cart',
        color: 'amber',
      };
    case 'CASH_SESSION_OPENED':
      return {
        title: 'Opened the cash drawer',
        detail: m.openingBalance != null ? `Starting float ${money(m.openingBalance)}` : null,
        icon: 'lock_open',
        color: 'blue',
      };
    case 'CASH_SESSION_CLOSED': {
      const v = num(m.variance);
      const variance = v === 0 ? 'Balanced perfectly' : `${v > 0 ? 'Over' : 'Short'} by ${money(Math.abs(v))}`;
      return {
        title: 'Closed the cash drawer',
        detail: [m.actualAmount != null && `Counted ${money(m.actualAmount)}`, variance].filter(Boolean).join(' · '),
        icon: 'lock',
        color: v === 0 ? 'indigo' : 'red',
      };
    }
    case 'INVENTORY_ADJUSTED': {
      const q = num(m.quantityChange);
      return {
        title: 'Stock adjusted by hand',
        detail: [
          `${q > 0 ? '+' : ''}${m.quantityChange} units`,
          m.beforeQty != null && m.afterQty != null && `${m.beforeQty} → ${m.afterQty}`,
          m.reason,
        ].filter(Boolean).join(' · ') || null,
        icon: 'tune',
        color: 'violet',
      };
    }
    case 'PRODUCT_CREATED':
      return {
        title: 'New product added',
        detail: [m.sku && `SKU ${m.sku}`, m.sellingPrice != null && money(m.sellingPrice)].filter(Boolean).join(' · ') || null,
        icon: 'inventory_2',
        color: 'teal',
      };
    case 'PRODUCT_UPDATED':
      return { title: 'Product details changed', detail: null, icon: 'edit', color: 'teal' };
    case 'PRODUCT_IMAGE_UPLOADED':
      return { title: 'Product photo updated', detail: null, icon: 'image', color: 'teal' };
    case 'PRODUCT_DEACTIVATED':
      return { title: 'Product deactivated', detail: 'Hidden from the till', icon: 'block', color: 'amber' };
    case 'PRODUCT_DELETED':
      return { title: 'Product deleted', detail: [m.sku && `SKU ${m.sku}`, m.name].filter(Boolean).join(' · ') || null, icon: 'delete', color: 'red' };
    case 'SERVICE_CREATED':
      return { title: 'New service added', detail: m.name ? `“${m.name}”` : null, icon: 'design_services', color: 'teal' };
    case 'SERVICE_UPDATED':
      return { title: 'Service details changed', detail: null, icon: 'edit', color: 'teal' };
    case 'SERVICE_DEACTIVATED':
      return { title: 'Service deactivated', detail: 'Hidden from the till', icon: 'block', color: 'amber' };
    case 'SERVICE_REACTIVATED':
      return { title: 'Service reactivated', detail: 'Back on the till', icon: 'restart_alt', color: 'green' };
    case 'SERVICE_DELETED':
      return { title: 'Service deleted', detail: null, icon: 'delete', color: 'red' };
    case 'USER_CREATED':
      return {
        title: 'New staff account created',
        detail: [m.email, m.role && humanize(m.role)].filter(Boolean).join(' · ') || null,
        icon: 'person_add',
        color: 'indigo',
      };
    case 'USER_UPDATED':
      return { title: 'Staff account updated', detail: null, icon: 'manage_accounts', color: 'indigo' };
    case 'USER_ACTIVATED':
      return { title: 'Staff account activated', detail: 'Access restored', icon: 'check_circle', color: 'green' };
    case 'USER_DEACTIVATED':
      return { title: 'Staff account deactivated', detail: 'Access removed', icon: 'block', color: 'amber' };
    case 'USER_DELETED':
      return { title: 'Staff account deleted', detail: [m.email, m.role && humanize(m.role)].filter(Boolean).join(' · ') || null, icon: 'person_remove', color: 'red' };
    case 'USER_PASSWORD_RESET':
      return { title: 'Staff password reset', detail: 'Their sessions were signed out', icon: 'lock_reset', color: 'indigo' };
    case 'AUTH_LOGIN':
      return { title: 'Signed in', detail: null, icon: 'login', color: 'slate' };
    case 'AUTH_LOGOUT':
      return { title: 'Signed out', detail: null, icon: 'logout', color: 'slate' };
    case 'AUTH_REFRESH_REUSE_DETECTED':
      return { title: 'Suspicious sign-in activity blocked', detail: 'A login session was ended for safety', icon: 'gpp_maybe', color: 'red' };
    default:
      return { title: humanize(log.action), detail: null, icon: 'bolt', color: 'slate' };
  }
}

export default function ActivityLogsPage() {
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState('');

  const { data, isLoading, isError, refetch, error } = useAuditLogs({
    page,
    limit: 20,
    entityType: entityType || undefined,
  });

  return (
    <div className="flex flex-col gap-gutter">
      <PageHeader
        title="Activity Logs"
        description="A clear, plain-language history of everything that happens in your shop."
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-outline-variant p-4 sm:flex-row sm:items-center">
          <span className="text-body-sm text-on-surface-variant">Show</span>
          <Select
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value);
              setPage(1);
            }}
            className="sm:w-64"
          >
            <option value="">All activity</option>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>

        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message={extractMessage(error)} onRetry={refetch} />
        ) : data!.data.length === 0 ? (
          <EmptyState icon="history" title="No activity found" description="Try choosing a different category above." />
        ) : (
          <>
            <ol className="relative p-6">
              <span className="absolute bottom-6 left-[2.65rem] top-6 w-px bg-outline-variant" aria-hidden />
              {data!.data.map((log) => (
                <TimelineRow key={log.id} log={log} />
              ))}
            </ol>
            <Pagination meta={data!.meta} onPage={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}

/** Maps an audit entity to the detail view it can deep-link into, if any. */
const DOC_KIND: Record<string, DocKind> = { Sale: 'sale', Purchase: 'purchase' };

function TimelineRow({ log }: { log: AuditLog }) {
  const { title, detail, icon, color } = describe(log);
  const person = log.user;
  const name = person?.fullName ?? 'System';
  const isSystem = !person;
  const kind = DOC_KIND[log.entityType];
  const to = kind && log.entityId ? docPath(kind, log.entityId) : null;

  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      <span
        className={cn(
          'z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-4 ring-surface-container-lowest',
          PALETTE[color],
        )}
      >
        <Icon name={icon} size={20} />
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <p className="flex items-center gap-1.5 font-semibold text-on-surface">
          {to ? (
            <Link to={to} className="hover:text-primary hover:underline underline-offset-2">
              {title}
            </Link>
          ) : (
            title
          )}
          {to && (
            <Link
              to={to}
              title="Open details"
              className="text-on-surface-variant hover:text-primary"
            >
              <Icon name="open_in_new" size={15} />
            </Link>
          )}
        </p>
        {detail && <p className="mt-0.5 text-body-sm text-on-surface-variant">{detail}</p>}

        {/* Who did it */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
          <span className="flex items-center gap-1.5">
            <span
              className={cn(
                'flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold',
                isSystem ? 'bg-surface-container text-on-surface-variant' : 'bg-primary text-on-primary',
              )}
            >
              {isSystem ? <Icon name="settings" size={12} /> : initials(name)}
            </span>
            <span className="font-medium text-on-surface">{name}</span>
          </span>
          {person?.role && <RoleChip role={person.role} />}
          {person?.email && (
            <span className="hidden font-mono-data text-outline sm:inline">{person.email}</span>
          )}
          <span className="text-outline">· {formatDateTime(log.createdAt)}</span>
        </div>
      </div>
    </li>
  );
}

function RoleChip({ role }: { role: 'ADMIN' | 'STAFF' }) {
  return (
    <span
      className={cn(
        'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        role === 'ADMIN'
          ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400'
          : 'bg-surface-container-high text-on-surface-variant',
      )}
    >
      {role === 'ADMIN' ? 'Admin' : 'Staff'}
    </span>
  );
}
