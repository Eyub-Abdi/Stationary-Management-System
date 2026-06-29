-- Optional wholesale price per piece on each variant (null = no wholesale tier).
ALTER TABLE "product_variants" ADD COLUMN "wholesalePrice" DECIMAL(14,2);
