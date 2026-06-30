-- Services consume product stock: a service option may use a product (e.g. paper).

-- Link a service option to the product it consumes, and how much per sale.
ALTER TABLE "service_variants" ADD COLUMN "consumesVariantId" UUID;
ALTER TABLE "service_variants" ADD COLUMN "consumesQty" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "service_variants"
  ADD CONSTRAINT "service_variants_consumesVariantId_fkey"
  FOREIGN KEY ("consumesVariantId") REFERENCES "product_variants"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "service_variants_consumesVariantId_idx" ON "service_variants"("consumesVariantId");

-- Snapshot what a service sale line consumed, so a void can restore it.
ALTER TABLE "sale_items" ADD COLUMN "consumedVariantId" UUID;
ALTER TABLE "sale_items" ADD COLUMN "consumedProductId" UUID;
ALTER TABLE "sale_items" ADD COLUMN "consumedQty" INTEGER NOT NULL DEFAULT 0;
