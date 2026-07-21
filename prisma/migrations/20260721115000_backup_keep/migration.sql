-- How many backup files to keep on disk. Retention was 30 days, which piled up
-- copies nobody wanted; keeping a small fixed number is what a shop machine
-- actually needs.
ALTER TABLE "app_settings" ADD COLUMN "backupKeep" INTEGER NOT NULL DEFAULT 3;
