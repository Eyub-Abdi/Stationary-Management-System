-- Service bill-of-materials: a service option may consume SEVERAL products, each
-- a whole count of base units per page or per job. Replaces the single-product
-- columns on service_variants / sale_items with child tables.

-- 1. Service option components (the BOM). -----------------------------------
CREATE TABLE "service_components" (
    "id" UUID NOT NULL,
    "serviceVariantId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "perPage" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "service_components_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "service_components_serviceVariantId_idx" ON "service_components"("serviceVariantId");
CREATE INDEX "service_components_variantId_idx" ON "service_components"("variantId");
ALTER TABLE "service_components"
  ADD CONSTRAINT "service_components_serviceVariantId_fkey"
  FOREIGN KEY ("serviceVariantId") REFERENCES "service_variants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_components"
  ADD CONSTRAINT "service_components_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "product_variants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. Per-sale-line consumption snapshots. -----------------------------------
CREATE TABLE "sale_item_consumptions" (
    "id" UUID NOT NULL,
    "saleItemId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "qty" INTEGER NOT NULL,
    "cogs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sale_item_consumptions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sale_item_consumptions_saleItemId_idx" ON "sale_item_consumptions"("saleItemId");
CREATE INDEX "sale_item_consumptions_variantId_idx" ON "sale_item_consumptions"("variantId");
ALTER TABLE "sale_item_consumptions"
  ADD CONSTRAINT "sale_item_consumptions_saleItemId_fkey"
  FOREIGN KEY ("saleItemId") REFERENCES "sale_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_item_consumptions"
  ADD CONSTRAINT "sale_item_consumptions_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "product_variants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Attribute each FIFO allocation to the product it drew from. -------------
ALTER TABLE "cogs_allocations" ADD COLUMN "saleItemConsumptionId" UUID;
CREATE INDEX "cogs_allocations_saleItemConsumptionId_idx" ON "cogs_allocations"("saleItemConsumptionId");
ALTER TABLE "cogs_allocations"
  ADD CONSTRAINT "cogs_allocations_saleItemConsumptionId_fkey"
  FOREIGN KEY ("saleItemConsumptionId") REFERENCES "sale_item_consumptions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Backfill existing single-product links into the new child tables. -------
-- One BOM row per option that consumed a product. perPage follows the service's
-- pricing model (PER_PAGE scaled by pages historically; FIXED was per job).
INSERT INTO "service_components" ("id", "serviceVariantId", "variantId", "qty", "perPage", "createdAt")
SELECT gen_random_uuid(), sv."id", sv."consumesVariantId", sv."consumesQty",
       (s."pricingType" = 'PER_PAGE'), CURRENT_TIMESTAMP
FROM "service_variants" sv
JOIN "services" s ON s."id" = sv."serviceId"
WHERE sv."consumesVariantId" IS NOT NULL;

-- One consumption snapshot per historical service line that drew a product.
-- lineCogs equalled the single consumed product's FIFO cost, so it maps 1:1.
INSERT INTO "sale_item_consumptions" ("id", "saleItemId", "variantId", "productId", "qty", "cogs", "createdAt")
SELECT gen_random_uuid(), si."id", si."consumedVariantId", si."consumedProductId",
       si."consumedQty", si."lineCogs", CURRENT_TIMESTAMP
FROM "sale_items" si
WHERE si."consumedVariantId" IS NOT NULL
  AND si."consumedProductId" IS NOT NULL
  AND si."consumedQty" > 0;

-- Re-point historical FIFO allocations of those lines to their (single) snapshot,
-- so the new void logic can restore per-consumption uniformly.
UPDATE "cogs_allocations" ca
SET "saleItemConsumptionId" = sic."id"
FROM "sale_item_consumptions" sic
WHERE ca."saleItemId" = sic."saleItemId";

-- 5. Drop the superseded single-product columns. ----------------------------
DROP INDEX "service_variants_consumesVariantId_idx";
ALTER TABLE "service_variants" DROP CONSTRAINT "service_variants_consumesVariantId_fkey";
ALTER TABLE "service_variants" DROP COLUMN "consumesVariantId";
ALTER TABLE "service_variants" DROP COLUMN "consumesQty";
ALTER TABLE "sale_items" DROP COLUMN "consumedVariantId";
ALTER TABLE "sale_items" DROP COLUMN "consumedProductId";
ALTER TABLE "sale_items" DROP COLUMN "consumedQty";
