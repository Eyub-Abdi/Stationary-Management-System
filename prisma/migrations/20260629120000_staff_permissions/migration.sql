-- Per-staff permission grants (admins always have full access). Default off.
ALTER TABLE "users" ADD COLUMN "canManageProducts" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "canManageServices" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "canManagePurchases" BOOLEAN NOT NULL DEFAULT false;
