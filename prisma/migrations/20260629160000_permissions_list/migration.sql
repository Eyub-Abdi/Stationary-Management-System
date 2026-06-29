-- Replace the per-capability boolean columns with a single string[] of grants.
ALTER TABLE "users" ADD COLUMN "permissions" TEXT[] NOT NULL DEFAULT '{}';

-- Backfill the list from the existing booleans so nobody loses access.
UPDATE "users" SET "permissions" = ARRAY_REMOVE(ARRAY[
  CASE WHEN "canManageProducts"  THEN 'products'  END,
  CASE WHEN "canManageServices"  THEN 'services'  END,
  CASE WHEN "canManagePurchases" THEN 'purchases' END,
  CASE WHEN "canManageInventory" THEN 'inventory' END
]::text[], NULL);

ALTER TABLE "users" DROP COLUMN "canManageProducts";
ALTER TABLE "users" DROP COLUMN "canManageServices";
ALTER TABLE "users" DROP COLUMN "canManagePurchases";
ALTER TABLE "users" DROP COLUMN "canManageInventory";
