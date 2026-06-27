-- Product variants: each product gains one or more sellable variants that carry
-- their own SKU, price, stock and FIFO cost. Existing products are migrated into
-- a single "Default" variant so no operational data changes.

-- CreateTable
CREATE TABLE "product_variants" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sellingPrice" DECIMAL(14,2) NOT NULL,
    "buyingPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "bulkSellingPrice" DECIMAL(14,2),
    "currentStock" INTEGER NOT NULL DEFAULT 0,
    "minStockLevel" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants"("sku");
CREATE INDEX "product_variants_productId_idx" ON "product_variants"("productId");
CREATE INDEX "product_variants_status_idx" ON "product_variants"("status");

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: create one default variant per existing product, carrying its
-- current price, stock, cost and status. The variant inherits the product SKU.
INSERT INTO "product_variants" (
    "id", "productId", "sku", "label", "sellingPrice", "buyingPrice",
    "bulkSellingPrice", "currentStock", "minStockLevel", "isDefault", "status",
    "createdAt", "updatedAt"
)
SELECT gen_random_uuid(), p."id", p."sku", 'Default', p."sellingPrice", p."buyingPrice",
       p."bulkSellingPrice", p."currentStock", p."minStockLevel", true, p."status",
       now(), now()
FROM "products" p;

-- variantId on transactional tables: add nullable, backfill from each row's
-- product default variant, then enforce NOT NULL (sale_items stays nullable —
-- service lines have no variant).
ALTER TABLE "inventory_adjustments" ADD COLUMN "variantId" UUID;
UPDATE "inventory_adjustments" t SET "variantId" = v."id"
  FROM "product_variants" v WHERE v."productId" = t."productId" AND v."isDefault" = true;
ALTER TABLE "inventory_adjustments" ALTER COLUMN "variantId" SET NOT NULL;

ALTER TABLE "inventory_batches" ADD COLUMN "variantId" UUID;
UPDATE "inventory_batches" t SET "variantId" = v."id"
  FROM "product_variants" v WHERE v."productId" = t."productId" AND v."isDefault" = true;
ALTER TABLE "inventory_batches" ALTER COLUMN "variantId" SET NOT NULL;

ALTER TABLE "inventory_movements" ADD COLUMN "variantId" UUID;
-- inventory_movements is append-only (prevent_mutation trigger); disable it for
-- the one-time backfill, then re-enable.
ALTER TABLE "inventory_movements" DISABLE TRIGGER "inventory_movements_no_update";
UPDATE "inventory_movements" t SET "variantId" = v."id"
  FROM "product_variants" v WHERE v."productId" = t."productId" AND v."isDefault" = true;
ALTER TABLE "inventory_movements" ENABLE TRIGGER "inventory_movements_no_update";
ALTER TABLE "inventory_movements" ALTER COLUMN "variantId" SET NOT NULL;

ALTER TABLE "purchase_items" ADD COLUMN "variantId" UUID;
UPDATE "purchase_items" t SET "variantId" = v."id"
  FROM "product_variants" v WHERE v."productId" = t."productId" AND v."isDefault" = true;
ALTER TABLE "purchase_items" ALTER COLUMN "variantId" SET NOT NULL;

ALTER TABLE "sale_items" ADD COLUMN "variantId" UUID;
UPDATE "sale_items" t SET "variantId" = v."id"
  FROM "product_variants" v
  WHERE v."productId" = t."productId" AND v."isDefault" = true AND t."productId" IS NOT NULL;

-- DropIndex (old product-keyed FIFO indexes, replaced by variant-keyed ones)
DROP INDEX "inventory_batches_productId_purchaseDate_createdAt_idx";
DROP INDEX "inventory_batches_productId_remainingQuantity_idx";

-- CreateIndex (variant-keyed)
CREATE INDEX "inventory_adjustments_variantId_idx" ON "inventory_adjustments"("variantId");
CREATE INDEX "inventory_batches_variantId_purchaseDate_createdAt_idx" ON "inventory_batches"("variantId", "purchaseDate", "createdAt");
CREATE INDEX "inventory_batches_variantId_remainingQuantity_idx" ON "inventory_batches"("variantId", "remainingQuantity");
CREATE INDEX "inventory_batches_productId_idx" ON "inventory_batches"("productId");
CREATE INDEX "inventory_movements_variantId_createdAt_idx" ON "inventory_movements"("variantId", "createdAt");
CREATE INDEX "purchase_items_variantId_idx" ON "purchase_items"("variantId");
CREATE INDEX "sale_items_variantId_idx" ON "sale_items"("variantId");

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Drop columns moved to product_variants (done last, after backfill read them).
ALTER TABLE "products" DROP COLUMN "bulkSellingPrice",
DROP COLUMN "buyingPrice",
DROP COLUMN "currentStock",
DROP COLUMN "minStockLevel",
DROP COLUMN "sellingPrice";
