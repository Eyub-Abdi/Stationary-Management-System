-- Paying a bill straight out of the held cash.
--
-- Held cash could only move to the bank or back into the drawer, so a bill
-- settled from the money in someone's pocket had to be recorded as a round
-- trip that never happened: return it to the till, then pay from the till. Two
-- fictions to record one real payment, and both of them moved a drawer that
-- was never opened.
--
-- Now a payment says which pot it came from. HELD_CASH leaves the till out of
-- it entirely — no session, no count to reconcile — and takes the money off the
-- held-cash ledger with a SPENT row pointing at what it paid for.

CREATE TYPE "PaymentSource" AS ENUM ('TILL', 'HELD_CASH');

ALTER TYPE "HandTransactionType" ADD VALUE 'SPENT';

ALTER TABLE "expenses" ADD COLUMN "paidFrom" "PaymentSource";

-- Everything on record was paid out of the drawer; an expense with nothing paid
-- against it came from no pot at all, so it stays null.
UPDATE "expenses" SET "paidFrom" = 'TILL' WHERE "amountPaid" > 0;

ALTER TABLE "expense_payments"
  ADD COLUMN "paidFrom" "PaymentSource" NOT NULL DEFAULT 'TILL';

ALTER TABLE "hand_transactions"
  ADD COLUMN "expenseId"        UUID,
  ADD COLUMN "expensePaymentId" UUID;

CREATE INDEX "hand_transactions_expenseId_idx" ON "hand_transactions"("expenseId");

ALTER TABLE "hand_transactions"
  ADD CONSTRAINT "hand_transactions_expenseId_fkey"
  FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "hand_transactions"
  ADD CONSTRAINT "hand_transactions_expensePaymentId_fkey"
  FOREIGN KEY ("expensePaymentId") REFERENCES "expense_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
