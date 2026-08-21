import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Combobox,
  Field,
  Icon,
  Input,
  Modal,
  SegmentedControl,
  Textarea,
} from '@/components/ui';
import { useToast } from '@/providers/ToastProvider';
import { useRecordWastage } from '@/hooks/useInventory';
import { useServices } from '@/hooks/useCatalog';
import { useProducts } from '@/hooks/useProducts';
import { extractMessage } from '@/lib/api';
import { ADJUSTMENT_REASONS, POS_WASTAGE_REASONS } from '@/lib/constants';
import { cn, currency, num } from '@/lib/utils';
import type { StockAdjustmentReason } from '@/types';

type Mode = 'service' | 'product';

/**
 * Records stock destroyed mid-job, at the counter where it happens.
 *
 * A jam is three sheets, not a stock count, and the person holding the ruined
 * paper is the cashier — so this lives on the POS screen rather than behind the
 * inventory permission. Pick the job it happened on and the bill of materials
 * works out which paper to take off; or name the product directly.
 */
export function WastageModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const record = useRecordWastage();
  const services = useServices({ status: 'ACTIVE', limit: 100 });
  const products = useProducts({ status: 'ACTIVE', limit: 100 });

  const [mode, setMode] = useState<Mode>('service');
  const [serviceVariantId, setServiceVariantId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [reasonCode, setReasonCode] = useState<StockAdjustmentReason>('JAM');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) {
      setMode('service');
      setServiceVariantId('');
      setVariantId('');
      setQuantity('1');
      setReasonCode('JAM');
      setNotes('');
    }
  }, [open]);

  // Only options with a bill of materials can be written off through — one with
  // no components consumes nothing, so there is nothing to take off a shelf.
  const serviceOptions = useMemo(
    () =>
      (services.data?.data ?? []).flatMap((s) =>
        s.variants
          .filter((v) => v.status === 'ACTIVE' && v.components.length > 0)
          .map((v) => ({
            id: v.id,
            label: v.label && v.label !== 'Standard' ? `${s.name} — ${v.label}` : s.name,
            components: v.components,
          })),
      ),
    [services.data],
  );

  const variantOptions = useMemo(
    () =>
      (products.data?.data ?? []).flatMap((p) =>
        p.variants
          .filter((v) => v.status === 'ACTIVE')
          .map((v) => ({
            id: v.id,
            label: v.label && v.label !== 'Default' ? `${p.name} — ${v.label}` : p.name,
            baseUnit: p.baseUnit,
            currentStock: v.currentStock,
            buyingPrice: num(v.buyingPrice),
          })),
      ),
    [products.data],
  );

  const qty = parseInt(quantity, 10) || 0;
  const chosenService = serviceOptions.find((o) => o.id === serviceVariantId);
  const chosenVariant = variantOptions.find((o) => o.id === variantId);

  // What the entry will actually take off the shelves. Per-page components
  // scale with the pages spoiled; per-job ones are charged once.
  const impact = useMemo(() => {
    if (mode === 'product') {
      return chosenVariant
        ? [
            {
              key: chosenVariant.id,
              name: chosenVariant.label,
              units: qty,
              unit: chosenVariant.baseUnit,
              stock: chosenVariant.currentStock,
              cost: chosenVariant.buyingPrice * qty,
            },
          ]
        : [];
    }
    return (chosenService?.components ?? []).map((c) => ({
      key: c.id,
      name: c.variant
        ? `${c.variant.product.name}${c.variant.label && c.variant.label !== 'Default' ? ` — ${c.variant.label}` : ''}`
        : 'Component',
      units: c.qty * (c.perPage ? qty : 1),
      unit: c.variant?.product.baseUnit ?? 'unit',
      stock: c.variant?.currentStock ?? 0,
      // The API costs this from the real FIFO batches; this is only a preview.
      cost: 0,
    }));
  }, [mode, chosenService, chosenVariant, qty]);

  const submit = async () => {
    if (mode === 'service' && !serviceVariantId) {
      return toast.error('Pick the job it happened on');
    }
    if (mode === 'product' && !variantId) return toast.error('Pick a product');
    if (qty <= 0) return toast.error('Enter how many were lost');

    try {
      const result = await record.mutateAsync({
        serviceVariantId: mode === 'service' ? serviceVariantId : undefined,
        variantId: mode === 'product' ? variantId : undefined,
        quantity: qty,
        reasonCode,
        notes: notes.trim() || undefined,
      });
      toast.success(
        'Wastage recorded',
        `${currency(result.totalCost)} written off stock and booked against profit.`,
      );
      onClose();
    } catch (e) {
      toast.error('Could not record it', extractMessage(e));
    }
  };

  const unitWord = mode === 'service' ? 'pages' : (chosenVariant?.baseUnit ?? 'units');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record wastage"
      subtitle="Paper spoiled mid-job — jams, misfeeds, ruined sheets"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={record.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={record.isPending} icon="delete_sweep">
            Write it off
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <SegmentedControl
          value={mode}
          onChange={setMode}
          items={[
            { value: 'service', label: 'On a job' },
            { value: 'product', label: 'A product' },
          ]}
        />

        {mode === 'service' ? (
          <Field
            label="Job it happened on"
            required
            hint="What that job uses per page decides what comes off the shelf"
          >
            <Combobox
              value={serviceVariantId}
              onChange={setServiceVariantId}
              options={serviceOptions.map((o) => ({ value: o.id, label: o.label }))}
              placeholder="e.g. Printing — A4"
            />
          </Field>
        ) : (
          <Field label="Product" required>
            <Combobox
              value={variantId}
              onChange={setVariantId}
              options={variantOptions.map((o) => ({
                value: o.id,
                label: `${o.label} — ${o.currentStock} in stock`,
              }))}
              placeholder="Type to search a product…"
            />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label={`How many ${unitWord}`} required>
            <Input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </Field>
          <Field label="What happened" required>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {POS_WASTAGE_REASONS.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setReasonCode(code)}
                  className={cn(
                    'flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-all',
                    reasonCode === code
                      ? 'border-secondary bg-secondary-container text-on-secondary-container'
                      : 'border-outline-variant text-on-surface-variant hover:border-secondary',
                  )}
                >
                  <Icon name={ADJUSTMENT_REASONS[code].icon} size={15} />
                  {ADJUSTMENT_REASONS[code].label.split(' ')[0].replace('/', '')}
                </button>
              ))}
            </div>
          </Field>
        </div>

        {/* Say out loud what is about to leave the shelf. A jam entered as 30
            instead of 3 is invisible as a number and obvious as a sentence. */}
        {impact.length > 0 && qty > 0 && (
          <div className="space-y-1.5 rounded-xl bg-surface-container-low px-3 py-2.5 text-[13px]">
            <p className="flex items-center gap-1.5 font-medium text-on-surface">
              <Icon name="inventory_2" size={16} />
              Comes off stock
            </p>
            {impact.map((i) => (
              <p key={i.key} className="flex justify-between text-on-surface-variant">
                <span>{i.name}</span>
                <span className="font-mono-data">
                  −{i.units.toLocaleString()} {i.unit}
                  <span className="ml-2 opacity-60">({i.stock.toLocaleString()} on hand)</span>
                </span>
              </p>
            ))}
            <p className="pt-1 text-[12px] text-on-surface-variant">
              Costed from the batches it came out of, and subtracted from this
              month's profit.
            </p>
          </div>
        )}

        <Field label="Note" hint="Optional — anything worth remembering">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Feeder pulled two sheets at once"
          />
        </Field>
      </div>
    </Modal>
  );
}
