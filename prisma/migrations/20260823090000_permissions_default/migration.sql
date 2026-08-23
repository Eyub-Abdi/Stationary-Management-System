-- Restore the empty-array default on users.permissions. A drift-fix in
-- 20260815201225_cash_closing_withdrawal dropped it, so inserts that omit the
-- column (the admin bootstrap seeds) hit a NOT NULL violation on a fresh DB.
ALTER TABLE "users" ALTER COLUMN "permissions" SET DEFAULT '{}';
UPDATE "users" SET "permissions" = '{}' WHERE "permissions" IS NULL;
