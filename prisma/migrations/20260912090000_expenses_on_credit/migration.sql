-- Office purchases taken on credit.
--
-- An office purchase charged the till the moment it was recorded, which is only
-- true when it was paid in cash. Goods taken from a vendor on account left the
-- drawer short by money that was still in it, and the debt itself was written
-- nowhere — the shop had to remember whom it owed.
--
-- The cost still lands on the date of the purchase (nothing about the P&L
-- changes); what moves is the cash. A credit purchase leaves "amountDue" owed
-- and is paid down through expense_payments, each payment charging the till of
-- the day it was actually handed over — the same shape as a supplier payable.

ALTER TABLE "expenses"
  ADD COLUMN "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
  ADD COLUMN "amountPaid"    DECIMAL(14,2)  NOT NULL DEFAULT 0,
  ADD COLUMN "amountDue"     DECIMAL(14,2)  NOT NULL DEFAULT 0;

-- Every expense on record was paid out of the till as it was entered, so the
-- invariant amountPaid + amountDue = amount holds from the first row onward.
UPDATE "expenses" SET "amountPaid" = "amount";

CREATE INDEX "expenses_amountDue_idx" ON "expenses"("amountDue");

CREATE TABLE "expense_payments" (
    "id"             UUID          NOT NULL,
    "expenseId"      UUID          NOT NULL,
    "userId"         UUID          NOT NULL,
    "cashSessionId"  UUID,
    "amount"         DECIMAL(14,2) NOT NULL,
    "notes"          TEXT,
    "idempotencyKey" TEXT,
    "createdAt"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "expense_payments_idempotencyKey_key" ON "expense_payments"("idempotencyKey");
CREATE INDEX "expense_payments_expenseId_idx" ON "expense_payments"("expenseId");
CREATE INDEX "expense_payments_cashSessionId_idx" ON "expense_payments"("cashSessionId");
CREATE INDEX "expense_payments_createdAt_idx" ON "expense_payments"("createdAt");

ALTER TABLE "expense_payments"
  ADD CONSTRAINT "expense_payments_expenseId_fkey"
  FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "expense_payments"
  ADD CONSTRAINT "expense_payments_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "expense_payments"
  ADD CONSTRAINT "expense_payments_cashSessionId_fkey"
  FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
