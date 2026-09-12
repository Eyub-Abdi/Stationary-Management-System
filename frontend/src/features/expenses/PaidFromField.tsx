import { Field, Select } from '@/components/ui';
import { useHandSummary } from '@/hooks/useBanking';
import { useAuth } from '@/providers/AuthProvider';
import { currency, num } from '@/lib/utils';
import type { PaymentSource } from '@/types';

/**
 * Which pot a payment comes out of.
 *
 * Only offered to admins, and only when there is held cash to spend: the rest
 * of the held-cash ledger is admin-only, and staff paying a bill are paying it
 * out of the drawer in front of them. Rendering nothing in those cases leaves
 * the caller's default of TILL, which is what used to happen unconditionally.
 */
export function PaidFromField({
  value,
  onChange,
}: {
  value: PaymentSource;
  onChange: (v: PaymentSource) => void;
}) {
  const { isAdmin } = useAuth();
  const hand = useHandSummary(isAdmin);
  const held = num(hand.data?.balance ?? 0);

  if (!isAdmin || held <= 0) return null;

  return (
    <Field
      label="Paid from"
      hint={
        value === 'HELD_CASH'
          ? `Spends the cash being held — ${currency(held)} available`
          : 'Comes out of the open till and shows in its count'
      }
    >
      <Select value={value} onChange={(e) => onChange(e.target.value as PaymentSource)}>
        <option value="TILL">The till</option>
        <option value="HELD_CASH">Held cash ({currency(held)})</option>
      </Select>
    </Field>
  );
}

/** The held balance, for callers that need to validate against it themselves. */
export function useHeldCash() {
  const { isAdmin } = useAuth();
  const hand = useHandSummary(isAdmin);
  return isAdmin ? num(hand.data?.balance ?? 0) : 0;
}
