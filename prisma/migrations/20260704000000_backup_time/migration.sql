-- Add a user-configurable daily backup time (local HH:mm, 24h).
ALTER TABLE "app_settings" ADD COLUMN "backupTime" TEXT NOT NULL DEFAULT '22:00';
