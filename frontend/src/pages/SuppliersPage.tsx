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
import { SupplierFormModal } from '@/features/suppliers/SupplierFormModal';
import { useSuppliers, useSupplierSummary } from '@/hooks/useCatalog';
import { extractMessage } from '@/lib/api';
import { currency, formatDate, num } from '@/lib/utils';
import type { Supplier } from '@/types';

export default function SuppliersPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'owing'>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);

  const { data, isLoading, isError, refetch, error } = useSuppliers({
    page,
    limit: 12,
    search: search || undefined,
    withBalance: filter === 'owing' || undefined,
  });
  const summary = useSupplierSummary();
  const stats = summary.data;

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  return (
    <div className="flex flex-col gap-gutter">
      <PageHeader
        title="Suppliers"
        description="Creditors you buy stock from. Track what you owe and record payments."
        actions={
          <Button icon="add" onClick={openCreate}>
            New Supplier
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-gutter lg:grid-cols-4">
        <StatCard
          label="Total we owe"
          icon="account_balance_wallet"
          accent="error"
          value={currency(stats?.totalPayable ?? 0)}
          hint="Outstanding payables"
          loading={summary.isLoading}
        />
        <StatCard
          label="Suppliers we owe"
          icon="groups"
          accent="tertiary"
          value={num(stats?.weOweCount ?? 0).toString()}
          hint={`of ${num(stats?.supplierCount ?? 0)} total`}
          loading={summary.isLoading}
        />
        <StatCard
          label="Largest single debt"
          icon="trending_up"
          accent="error"
          value={currency(stats?.largestDebt ?? 0)}
          hint="Biggest creditor balance"
          loading={summary.isLoading}
        />
        <StatCard
          label="Total suppliers"
          icon="local_shipping"
          accent="primary"
          value={num(stats?.supplierCount ?? 0).toString()}
          hint="On record"
          loading={summary.isLoading}
        />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-outline-variant p-4 sm:flex-row sm:items-center sm:justify-between">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search by name…"
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
              { value: 'owing', label: 'We owe' },
            ]}
          />
        </div>

        {isLoading ? (
          <LoadingState label="Loading suppliers…" />
        ) : isError ? (
          <ErrorState message={extractMessage(error)} onRetry={refetch} />
        ) : data!.data.length === 0 ? (
          <EmptyState
            icon="local_shipping"
            title="No suppliers"
            description="Add a supplier to record purchases and credit."
            action={<Button icon="add" onClick={openCreate}>New Supplier</Button>}
          />
        ) : (
          <>
            <Table>
              <THead>
                <TH>Name</TH>
                <TH>Phone</TH>
                <TH>Address</TH>
                <TH>Last credit purchase</TH>
                <TH align="right">We owe</TH>
                <TH align="right">Action</TH>
              </THead>
              <TBody>
                {data!.data.map((s) => (
                  <TR key={s.id} onClick={() => navigate(`/suppliers/${s.id}`)}>
                    <TD className="font-semibold text-on-surface">
                      {s.name}
                      {!s.isActive && <Badge tone="neutral" className="ml-2">Inactive</Badge>}
                    </TD>
                    <TD className="text-on-surface-variant">{s.phone ?? '—'}</TD>
                    <TD className="max-w-[16rem] truncate text-on-surface-variant">{s.address || '—'}</TD>
                    <TD className="whitespace-nowrap text-on-surface-variant">
                      {s.lastCreditPurchaseAt ? formatDate(s.lastCreditPurchaseAt) : '—'}
                    </TD>
                    <TD align="right" className="font-mono-data">
                      {num(s.balance) > 0 ? (
                        <span className="font-semibold text-error">{currency(s.balance)}</span>
                      ) : (
                        <span className="text-on-surface-variant">—</span>
                      )}
                    </TD>
                    <TD align="right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing(s);
                          setFormOpen(true);
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

      <SupplierFormModal open={formOpen} onClose={() => setFormOpen(false)} supplier={editing} />
    </div>
  );
}
