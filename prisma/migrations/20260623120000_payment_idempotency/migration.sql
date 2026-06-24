-- Idempotency keys for unsafe POST operations (dedup retries / double-submits).
-- Nullable + UNIQUE: Postgres permits multiple NULLs, so existing rows are fine.

ALTER TABLE "purchases" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "customer_payments" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "supplier_payments" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "purchases_idempotencyKey_key" ON "purchases"("idempotencyKey");
CREATE UNIQUE INDEX "customer_payments_idempotencyKey_key" ON "customer_payments"("idempotencyKey");
CREATE UNIQUE INDEX "supplier_payments_idempotencyKey_key" ON "supplier_payments"("idempotencyKey");
