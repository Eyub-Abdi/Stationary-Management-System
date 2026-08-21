-- Wastage accounting: categorise stock adjustments, cost them from FIFO, and
-- let a loss be attributed to the service job that caused it.

-- CreateEnum
CREATE TYPE "StockAdjustmentReason" AS ENUM ('JAM', 'SPOILED', 'DAMAGED', 'EXPIRED', 'LOST', 'THEFT', 'COUNT_CORRECTION', 'FOUND', 'OTHER');

-- AlterTable
ALTER TABLE "inventory_adjustments"
  ADD COLUMN "reasonCode"       "StockAdjustmentReason" NOT NULL DEFAULT 'OTHER',
  ADD COLUMN "costImpact"       DECIMAL(14,2),
  ADD COLUMN "serviceVariantId" UUID;

-- Backfill the category from the free text that used to carry it. Anything the
-- keywords don't recognise stays OTHER.
UPDATE "inventory_adjustments" SET "reasonCode" = 'JAM'
  WHERE reason ILIKE '%jam%' OR reason ILIKE '%misprint%';
UPDATE "inventory_adjustments" SET "reasonCode" = 'SPOILED'
  WHERE "reasonCode" = 'OTHER' AND (reason ILIKE '%spoil%' OR reason ILIKE '%wast%');
UPDATE "inventory_adjustments" SET "reasonCode" = 'DAMAGED'
  WHERE "reasonCode" = 'OTHER' AND (reason ILIKE '%damag%' OR reason ILIKE '%broke%' OR reason ILIKE '%torn%');
UPDATE "inventory_adjustments" SET "reasonCode" = 'EXPIRED'
  WHERE "reasonCode" = 'OTHER' AND reason ILIKE '%expir%';
UPDATE "inventory_adjustments" SET "reasonCode" = 'THEFT'
  WHERE "reasonCode" = 'OTHER' AND (reason ILIKE '%theft%' OR reason ILIKE '%stolen%' OR reason ILIKE '%stole%');
UPDATE "inventory_adjustments" SET "reasonCode" = 'LOST'
  WHERE "reasonCode" = 'OTHER' AND (reason ILIKE '%lost%' OR reason ILIKE '%missing%');
UPDATE "inventory_adjustments" SET "reasonCode" = 'FOUND'
  WHERE "reasonCode" = 'OTHER' AND "quantityChange" > 0 AND (reason ILIKE '%found%' OR reason ILIKE '%extra%');
UPDATE "inventory_adjustments" SET "reasonCode" = 'COUNT_CORRECTION'
  WHERE "reasonCode" = 'OTHER' AND (reason ILIKE '%count%' OR reason ILIKE '%correct%' OR reason ILIKE '%recount%' OR reason ILIKE '%stock take%' OR reason ILIKE '%stocktake%');

-- costImpact is deliberately left NULL on rows that predate this migration.
-- The FIFO batches those adjustments consumed are long since spent, so their
-- real cost is not recoverable, and pricing them off today's reference buying
-- price would restate months of already-reported profit on a guess. A NULL
-- contributes nothing to the wastage totals, so the accounting starts clean
-- from here: everything written off from now on is costed from the batches it
-- actually came out of.

-- CreateIndex
CREATE INDEX "inventory_adjustments_reasonCode_idx" ON "inventory_adjustments"("reasonCode");
CREATE INDEX "inventory_adjustments_createdAt_idx" ON "inventory_adjustments"("createdAt");
CREATE INDEX "inventory_adjustments_serviceVariantId_idx" ON "inventory_adjustments"("serviceVariantId");

-- AddForeignKey
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_serviceVariantId_fkey" FOREIGN KEY ("serviceVariantId") REFERENCES "service_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Monthly statements snapshot the same figures the reports show, so they need
-- somewhere to keep the wastage line. Months already closed keep 0: that is
-- genuinely what their stored netProfit was computed with.
ALTER TABLE "accounting_periods"
  ADD COLUMN "stockLoss" DECIMAL(14,2) NOT NULL DEFAULT 0;
