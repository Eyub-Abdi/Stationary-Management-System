import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Icon,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Pagination,
  SearchInput,
  SegmentedControl,
  Select,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from '@/components/ui';
import { useToast } from '@/providers/ToastProvider';
import { usePurchases, usePurchasesDaily } from '@/hooks/usePurchases';
import {
  useCreateUnit,
  useDeleteUnit,
  useUnits,
  useUpdateUnit,
} from '@/hooks/useCatalog';
import { DocLink } from '@/components/DocLink';
import { extractMessage } from '@/lib/api';
import { currency, formatDate, num } from '@/lib/utils';
import { rangeFor, toDateInput, type RangeKey } from '@/lib/dateRange';
import type { Unit } from '@/types';

type ViewKey = 'list' | 'daily';

export default function PurchasesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialDate = searchParams.get('date') ?? '';

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [unitsOpen, setUnitsOpen] = useState(false);
  const [rangeKey, setRangeKey] = useState<RangeKey>(initialDate ? 'custom' : 'all');
  const [customFrom, setCustomFrom] = useState(initialDate);
  const [customTo, setCustomTo] = useState(initialDate);
  const [view, setView] = useState<ViewKey>(() =>
    initialDate ? 'list' : localStorage.getItem('purchases-view') === 'daily' ? 'daily' : 'list',
  );
  useEffect(() => {
    localStorage.setItem('purchases-view', view);
  }, [view]);

  const range = rangeFor(rangeKey, customFrom, customTo);
  const { data, isLoading, isError, refetch, error } = usePurchases({
    page,
    limit: 12,
    search: search || undefined,
    ...range,
  });

  const daily = usePurchasesDaily(range, view === 'daily');
  const dailyRows = daily.data ?? [];
  const dailyTotal = dailyRows.reduce((a, r) => a + num(r.total), 0);
  const dailyCount = dailyRows.reduce((a, r) => a + r.count, 0);

  // Drill into a single day: filter the purchases list to that date.
  const openDay = (period: string) => {
    const day = toDateInput(period);
    if (!day) return;
    setCustomFrom(day);
    setCustomTo(day);
    setRangeKey('custom');
    setSearch('');
    setPage(1);
    setView('list');
  };

  return (
    <div className="flex flex-col gap-gutter">
      <PageHeader
        title="Purchases"
        description="Record stock received from suppliers — pay cash or on credit, by piece or by pack."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" icon="straighten" onClick={() => setUnitsOpen(true)}>
              Manage units
            </Button>
            <Button icon="add" onClick={() => navigate('/purchases/new')}>
              New Purchase
            </Button>
          </div>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-outline-variant p-4 lg:flex-row lg:items-center">
          {view === 'list' ? (
            <SearchInput
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder="Search by purchase number…"
              className="flex-1"
            />
          ) : (
            <div className="flex-1" />
          )}
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl<ViewKey>
              value={view}
              onChange={setView}
              items={[
                { value: 'list', label: 'Purchases' },
                { value: 'daily', label: 'Daily totals' },
              ]}
            />
            <Select
              value={rangeKey}
              onChange={(e) => {
                setRangeKey(e.target.value as RangeKey);
                setPage(1);
              }}
              className="w-40"
            >
              <option value="all">All time</option>
              <option value="today">Today</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="custom">Custom range</option>
            </Select>
            {rangeKey === 'custom' && (
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  aria-label="From date"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={(e) => {
                    setCustomFrom(e.target.value);
                    setPage(1);
                  }}
                  className="w-40"
                />
                <span className="text-on-surface-variant">–</span>
                <Input
                  type="date"
                  aria-label="To date"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={(e) => {
                    setCustomTo(e.target.value);
                    setPage(1);
                  }}
                  className="w-40"
                />
              </div>
            )}
          </div>
        </div>

        {view === 'daily' ? (
          daily.isLoading ? (
            <LoadingState label="Loading daily totals…" />
          ) : daily.isError ? (
            <ErrorState message={extractMessage(daily.error)} onRetry={daily.refetch} />
          ) : dailyRows.length === 0 ? (
            <EmptyState
              icon="calendar_month"
              title="No purchases in this range"
              description="Pick a different date range to see daily totals."
            />
          ) : (
            <Table>
              <THead>
                <TH>Date</TH>
                <TH align="center">Purchases</TH>
                <TH align="right">Total cost</TH>
                <TH align="right">Action</TH>
              </THead>
              <TBody>
                {dailyRows.map((r) => (
                  <TR key={r.period} onClick={() => openDay(r.period)}>
                    <TD className="whitespace-nowrap font-medium">{formatDate(r.period)}</TD>
                    <TD align="center" className="font-mono-data">{r.count}</TD>
                    <TD align="right" className="font-mono-data font-semibold">{currency(r.total)}</TD>
                    <TD align="right">
                      <Icon name="chevron_right" size={20} className="text-on-surface-variant" />
                    </TD>
                  </TR>
                ))}
                <TR className="bg-surface-container-low">
                  <TD className="font-semibold">Total</TD>
                  <TD align="center" className="font-mono-data font-semibold">{dailyCount}</TD>
                  <TD align="right" className="font-mono-data font-semibold">{currency(dailyTotal)}</TD>
                  <TD />
                </TR>
              </TBody>
            </Table>
          )
        ) : isLoading ? (
          <LoadingState label="Loading purchases…" />
        ) : isError ? (
          <ErrorState message={extractMessage(error)} onRetry={refetch} />
        ) : data!.data.length === 0 ? (
          <EmptyState
            icon="shopping_cart"
            title="No purchases recorded"
            description="Record your first stock purchase to build inventory."
            action={<Button icon="add" onClick={() => navigate('/purchases/new')}>New Purchase</Button>}
          />
        ) : (
          <>
            <Table>
              <THead>
                <TH>Purchase #</TH>
                <TH>Product</TH>
                <TH>Supplier</TH>
                <TH>Date</TH>
                <TH>Payment</TH>
                <TH align="right">Total Cost</TH>
                <TH align="right">Owing</TH>
                <TH align="right">Action</TH>
              </THead>
              <TBody>
                {data!.data.map((p) => {
                  const items = p.items ?? [];
                  const first = items[0];
                  const extra = items.length - 1;
                  return (
                  <TR key={p.id} onClick={() => navigate(`/purchases/${p.id}`)}>
                    <TD>
                      <DocLink kind="purchase" id={p.id}>{p.purchaseNumber}</DocLink>
                    </TD>
                    <TD>
                      {first ? (
                        <span>
                          {first.productNameSnapshot}
                          {extra > 0 && (
                            <span className="text-on-surface-variant"> +{extra} more</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-on-surface-variant">—</span>
                      )}
                    </TD>
                    <TD>{p.supplier?.name ?? 'Walk-in / Direct'}</TD>
                    <TD>{formatDate(p.purchaseDate)}</TD>
                    <TD>
                      <Badge tone={p.paymentMethod === 'CREDIT' ? 'warning' : 'neutral'}>
                        {p.paymentMethod === 'CREDIT' ? 'Credit' : 'Cash'}
                      </Badge>
                    </TD>
                    <TD align="right" className="font-mono-data font-semibold">{currency(p.totalCost)}</TD>
                    <TD align="right" className="font-mono-data">
                      {num(p.amountDue) > 0 ? (
                        <span className="font-semibold text-error">{currency(p.amountDue)}</span>
                      ) : (
                        <span className="text-on-surface-variant">—</span>
                      )}
                    </TD>
                    <TD align="right">
                      <Icon name="chevron_right" size={20} className="text-on-surface-variant" />
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

      <ManageUnitsModal open={unitsOpen} onClose={() => setUnitsOpen(false)} />
    </div>
  );
}

/** Full CRUD for the reusable pack units (Box, Roll, …) used in purchases. */
function ManageUnitsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const { data: units, isLoading } = useUnits();
  const createUnit = useCreateUnit();
  const updateUnit = useUpdateUnit();
  const deleteUnit = useDeleteUnit();

  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deleting, setDeleting] = useState<Unit | null>(null);

  useEffect(() => {
    if (!open) {
      setNewName('');
      setEditingId(null);
      setEditName('');
      setDeleting(null);
    }
  }, [open]);

  const add = async () => {
    const name = newName.trim();
    if (!name) {
      toast.error('Name required', 'Enter a unit name (e.g. Box).');
      return;
    }
    try {
      await createUnit.mutateAsync({ name });
      setNewName('');
      toast.success('Unit added', name);
    } catch (e) {
      toast.error('Could not add unit', extractMessage(e));
    }
  };

  const saveEdit = async (u: Unit) => {
    const name = editName.trim();
    if (!name) {
      toast.error('Name required', 'A unit needs a name.');
      return;
    }
    try {
      await updateUnit.mutateAsync({ id: u.id, input: { name } });
      setEditingId(null);
      toast.success('Unit renamed', name);
    } catch (e) {
      toast.error('Could not rename', extractMessage(e));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteUnit.mutateAsync(deleting.id);
      toast.success('Unit deleted', deleting.name);
      setDeleting(null);
    } catch (e) {
      toast.error('Could not delete', extractMessage(e));
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="md"
        title="Manage units"
        subtitle="Reusable pack units (Box, Roll, Ream…) for receiving stock"
        footer={
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="flex items-end gap-2">
            <Field label="Add a unit" className="flex-1">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void add();
                  }
                }}
                placeholder="e.g. Bundle"
              />
            </Field>
            <Button icon="add" loading={createUnit.isPending} onClick={add}>
              Add
            </Button>
          </div>

          {isLoading ? (
            <LoadingState label="Loading units…" />
          ) : (units?.length ?? 0) === 0 ? (
            <p className="text-body-sm text-on-surface-variant">No units yet. Add one above.</p>
          ) : (
            <ul className="divide-y divide-outline-variant rounded-xl border border-outline-variant">
              {units!.map((u) => (
                <li key={u.id} className="flex items-center gap-2 p-2.5">
                  {editingId === u.id ? (
                    <>
                      <Input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void saveEdit(u);
                          }
                        }}
                        className="flex-1"
                      />
                      <Button size="sm" icon="check" loading={updateUnit.isPending} onClick={() => saveEdit(u)} />
                      <Button size="sm" variant="outline" icon="close" onClick={() => setEditingId(null)} />
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-body-sm font-medium text-on-surface">{u.name}</span>
                      <button
                        onClick={() => {
                          setEditingId(u.id);
                          setEditName(u.name);
                        }}
                        title="Rename"
                        className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                      >
                        <Icon name="edit" size={18} />
                      </button>
                      <button
                        onClick={() => setDeleting(u)}
                        title="Delete"
                        className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container hover:text-error"
                      >
                        <Icon name="delete" size={18} />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={deleteUnit.isPending}
        title="Delete unit?"
        message={`"${deleting?.name}" will be removed from the unit list. Past purchases keep their recorded unit.`}
        confirmLabel="Delete"
        icon="delete"
      />
    </>
  );
}
