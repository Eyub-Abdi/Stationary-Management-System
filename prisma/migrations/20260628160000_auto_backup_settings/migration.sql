-- Automatic local-disk backup configuration + last-run status on app settings.
ALTER TABLE "app_settings" ADD COLUMN "autoBackupEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "app_settings" ADD COLUMN "backupDir" TEXT;
ALTER TABLE "app_settings" ADD COLUMN "lastBackupAt" TIMESTAMP(3);
ALTER TABLE "app_settings" ADD COLUMN "lastBackupStatus" TEXT;
ALTER TABLE "app_settings" ADD COLUMN "lastBackupPath" TEXT;
