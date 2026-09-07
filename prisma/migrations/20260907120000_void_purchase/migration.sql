-- Undoing a purchase.
--
-- A purchase entered with the wrong quantity, the wrong cost or against the
-- wrong supplier had no way back: the only remedy was a negative stock
-- adjustment, which left the cost on the books and read as wastage. Voiding
-- undoes the whole thing at once, and only while it still can be undone
-- honestly, which means nothing has been sold out of its FIFO batches.
--
-- A soft delete rather than a row removed: the number, the lines and the
-- supplier stay legible in the ledger, and everything that counts purchases
-- filters on the status instead.

CREATE TYPE "PurchaseStatus" AS ENUM ('COMPLETED', 'VOIDED');

ALTER TABLE "purchases"
  ADD COLUMN "status"     "PurchaseStatus" NOT NULL DEFAULT 'COMPLETED',
  ADD COLUMN "voidedAt"   TIMESTAMP(3),
  ADD COLUMN "voidReason" TEXT;

CREATE INDEX "purchases_status_idx" ON "purchases"("status");
