-- Per-staff "manage inventory" grant (stock adjustments). Default off.
ALTER TABLE "users" ADD COLUMN "canManageInventory" BOOLEAN NOT NULL DEFAULT false;
