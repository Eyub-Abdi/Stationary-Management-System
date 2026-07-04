import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  LoadingState,
  PageHeader,
  Pagination,
  SearchInput,
  SegmentedControl,
  StatCard,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from '@/components/ui';
import { CustomerFormModal } from '@/features/customers/CustomerFormModal';
import { useCustomerAging, useCustomers } from '@/hooks/useCustomers';
import { extractMessage } from '@/lib/api';
import { currency, formatDate, num } from '@/lib/utils';
import type { Customer } from '@/types';

export default function CustomersPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'owing'>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);

  const { data, isLoading, isError, refetch, error } = useCustomers({
    page,
    limit: 12,
    search: search || undefined,
    withBalance: filter === 'owing' || undefined,
  });

  const aging = useCustomerAging();
  // Aging totals + per-customer overdue (90+) lookup for the list badges.
  const agingTotals = (aging.data ?? []).reduce(
    (a, r) => ({
      current: a.current + num(r.current),
      d3160: a.d3160 + num(r.days31to60),
      d6190: a.d6190 + num(r.days61to90),
      d90: a.d90 + num(r.days90plus),
    }),
    { current: 0, d3160: 0, d6190: 0, d90: 0 },
  );
  const overdue90 = new Set((aging.data ?? []).filter((r) => num(r.days90plus) > 0).map((r) => r.id));

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (c: Customer) => {
    setEditing(c);
    setFormOpen(true);
  };

  return (
    <div className="flex flex-col gap-gutter">
      <PageHeader
        title="Customers"
        description="Debtors who buy on credit. Track outstanding balances and record repayments."
        actions={
          <Button icon="person_add" onClick={openCreate}>
            New Customer
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-gutter sm:grid-cols-4">
        <StatCard label="Current (0–30d)" icon="schedule" accent="primary" value={currency(agingTotals.current)} loading={aging.isLoading} />
        <StatCard label="31–60 days" icon="hourglass_bottom" accent="tertiary" value={currency(agingTotals.d3160)} loading={aging.isLoading} />
        <StatCard label="61–90 days" icon="warning" accent="tertiary" value={currency(agingTotals.d6190)} loading={aging.isLoading} />
        <StatCard label="90+ days overdue" icon="error" accent="error" value={currency(agingTotals.d90)} loading={aging.isLoading} />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-outline-variant p-4 sm:flex-row sm:items-center sm:justify-between">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search by name or phone…"
            className="max-w-md"
          />
          <SegmentedControl
            value={filter}
            onChange={(v) => {
              setFilter(v);
              setPage(1);
            }}
            items={[
              { value: 'all', label: 'All' },
              { value: 'owing', label: 'Owing' },
            ]}
          />
        </div>

        {isLoading ? (
          <LoadingState label="Loading customers…" />
        ) : isError ? (
          <ErrorState message={extractMessage(error)} onRetry={refetch} />
        ) : data!.data.length === 0 ? (
          <EmptyState
            icon="group"
            title="No customers"
            description="Add a customer to start recording credit sales."
            action={<Button icon="person_add" onClick={openCreate}>New Customer</Button>}
          />
        ) : (
          <>
            <Table>
              <THead>
                <TH>Name</TH>
                <TH>Phone</TH>
                <TH>Last credit sale</TH>
                <TH align="right">Balance owed</TH>
                <TH align="right">Action</TH>
              </THead>
              <TBody>
                {data!.data.map((c) => (
                  <TR key={c.id} onClick={() => navigate(`/customers/${c.id}`)}>
                    <TD className="font-semibold text-on-surface">
                      {c.name}
                      {!c.isActive && <Badge tone="neutral" className="ml-2">Inactive</Badge>}
                      {overdue90.has(c.id) && <Badge tone="error" className="ml-2">Overdue 90+</Badge>}
                      {c.creditLimit && num(c.balance) > num(c.creditLimit) && (
                        <Badge tone="warning" className="ml-2">Over limit</Badge>
                      )}
                    </TD>
                    <TD className="text-on-surface-variant">{c.phone ?? '—'}</TD>
                    <TD className="whitespace-nowrap text-on-surface-variant">
                      {c.lastCreditSaleAt ? formatDate(c.lastCreditSaleAt) : '—'}
                    </TD>
                    <TD align="right" className="font-mono-data">
                      {num(c.balance) > 0 ? (
                        <span className="font-semibold text-error">{currency(c.balance)}</span>
                      ) : (
                        <span className="text-on-surface-variant">—</span>
                      )}
                      {c.creditLimit && (
                        <span className="block text-[11px] text-on-surface-variant">
                          limit {currency(c.creditLimit)}
                        </span>
                      )}
                    </TD>
                    <TD align="right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(c);
                        }}
                        className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                      >
                        <Icon name="edit" size={18} />
                      </button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination meta={data!.meta} onPage={setPage} />
          </>
        )}
      </Card>

      <CustomerFormModal open={formOpen} onClose={() => setFormOpen(false)} customer={editing} />
    </div>
  );
}
