-- Cash held outside the till.
--
-- Closing the till with money "kept on hand" subtracted it from the drawer and
-- added it nowhere: not the bank (nobody had been), not the drawer, not a loan.
-- The money was real and invisible. Worse, when the weekly bank trip finally
-- happened there was no way to record it — a transfer to the bank withdraws
-- from the open till, and the cash had left the till days earlier.
--
-- So: a third place money can sit, kept the same way as the bank ledger. The
-- amount is signed against the balance, the balance is SUM(amount), and there
-- is no stored total to drift out of step with the rows behind it.

CREATE TYPE "HandTransactionType" AS ENUM ('OPENING_BALANCE', 'FROM_TILL', 'TO_BANK', 'TO_TILL', 'CORRECTION');

CREATE TABLE "hand_transactions" (
    "id"            UUID                  NOT NULL,
    "type"          "HandTransactionType" NOT NULL,
    "amount"        DECIMAL(14,2)         NOT NULL,
    "occurredAt"    TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes"         TEXT,
    "userId"        UUID                  NOT NULL,
    "cashSessionId" UUID,
    "bankTxId"      UUID,
    "createdAt"     TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hand_transactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "hand_transactions_occurredAt_idx" ON "hand_transactions"("occurredAt");
CREATE INDEX "hand_transactions_type_idx" ON "hand_transactions"("type");
CREATE INDEX "hand_transactions_cashSessionId_idx" ON "hand_transactions"("cashSessionId");

ALTER TABLE "hand_transactions"
  ADD CONSTRAINT "hand_transactions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "hand_transactions"
  ADD CONSTRAINT "hand_transactions_cashSessionId_fkey"
  FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Sessions already closed with cash kept on hand: that money is still being
-- held, so seed the ledger with it rather than starting from zero and reporting
-- a balance the shop knows is wrong. Sessions that banked their withdrawal are
-- skipped — the bank ledger already has those, and counting them here would
-- show the same shillings in two places at once.
--
-- "withdrawalTo" was not stored before this release, so which of the two
-- happened is only recorded in the audit log. A closing withdrawal with no
-- matching TRANSFER_IN on the bank ledger for that session was kept in hand.
INSERT INTO "hand_transactions" ("id", "type", "amount", "occurredAt", "notes", "userId", "cashSessionId")
SELECT gen_random_uuid(),
       'FROM_TILL',
       s."closingWithdrawal",
       COALESCE(s."closedAt", s."openedAt"),
       'Kept on hand at close (recorded when the held-cash ledger was added)',
       s."userId",
       s."id"
FROM "cash_sessions" s
WHERE s."closingWithdrawal" IS NOT NULL
  AND s."closingWithdrawal" > 0
  AND NOT EXISTS (
    SELECT 1 FROM "bank_transactions" b
    WHERE b."cashSessionId" = s."id" AND b."type" = 'TRANSFER_IN'
  );
