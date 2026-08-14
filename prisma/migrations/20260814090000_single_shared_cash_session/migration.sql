-- The shop runs ONE shared till. Cashiers were opening a session each and
-- leaving them open, so takings scattered across several "open" sessions and
-- no drawer ever reconciled. From here on there is a single cash session that
-- every user posts to.

-- Fold whatever is open today into the most recently opened session (the one
-- actually in use). Each of the others is closed at the cash its own books say
-- it holds — expected = actual, variance 0, because the money never physically
-- left the drawer — and the sum of those balances becomes the surviving
-- session's opening float. The running total therefore carries across the
-- cut-over instead of restarting, and a genuine shortfall still surfaces as a
-- variance at the next real close.
WITH survivor AS (
  SELECT "id" FROM "cash_sessions"
  WHERE "status" = 'OPEN'
  ORDER BY "openedAt" DESC
  LIMIT 1
),
-- Same formula as CashService.computeBreakdown:
--   opening + cash sales + customer payments + deposits
--           − expenses − withdrawals − cash refunds − purchases − supplier payments
folded AS (
  SELECT
    s."id",
    s."openingBalance"
      + COALESCE((SELECT SUM("amountPaid") FROM "sales"
                   WHERE "cashSessionId" = s."id" AND "status" = 'COMPLETED'), 0)
      + COALESCE((SELECT SUM("amount") FROM "customer_payments"
                   WHERE "cashSessionId" = s."id"), 0)
      + COALESCE((SELECT SUM("amount") FROM "cash_movements"
                   WHERE "cashSessionId" = s."id" AND "type" = 'DEPOSIT'), 0)
      - COALESCE((SELECT SUM("amount") FROM "cash_movements"
                   WHERE "cashSessionId" = s."id" AND "type" = 'WITHDRAWAL'), 0)
      - COALESCE((SELECT SUM("amount") FROM "expenses"
                   WHERE "cashSessionId" = s."id"), 0)
      -- Only the cash half of a refund leaves the till; credit-applied refunds
      -- come off the customer's balance instead.
      - COALESCE((SELECT SUM("totalRefund" - "creditApplied") FROM "sale_returns"
                   WHERE "cashSessionId" = s."id"), 0)
      - COALESCE((SELECT SUM("amountPaid") FROM "purchases"
                   WHERE "cashSessionId" = s."id"), 0)
      - COALESCE((SELECT SUM("amount") FROM "supplier_payments"
                   WHERE "cashSessionId" = s."id"), 0)
      AS "expected"
  FROM "cash_sessions" s
  WHERE s."status" = 'OPEN'
    AND s."id" <> (SELECT "id" FROM survivor)
),
closed AS (
  UPDATE "cash_sessions" c
  SET "status"         = 'CLOSED',
      "closedAt"       = NOW(),
      "expectedAmount" = folded."expected",
      "actualAmount"   = folded."expected",
      "variance"       = 0,
      "notes"          = CONCAT_WS(
        ' | ',
        c."notes",
        'Auto-closed: the shop moved to a single shared cash session; this balance was carried into it.'
      )
  FROM folded
  WHERE c."id" = folded."id"
  RETURNING folded."expected"
)
UPDATE "cash_sessions"
SET "openingBalance" = (SELECT SUM("expected") FROM closed)
WHERE "id" = (SELECT "id" FROM survivor)
  AND EXISTS (SELECT 1 FROM closed);

-- Enforce it in the database, not just in the service: at most one OPEN row.
-- Prisma cannot express a partial unique index, so this index lives only here
-- (see the note on model CashSession in schema.prisma).
CREATE UNIQUE INDEX "cash_sessions_single_open"
  ON "cash_sessions" ("status")
  WHERE "status" = 'OPEN';
