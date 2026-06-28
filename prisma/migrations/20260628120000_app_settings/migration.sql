-- Application settings: a single owner-editable row for branding such as the
-- shop name shown across the app. Seeded with the current defaults.

-- CreateTable
CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL DEFAULT 'KJ Stationery',
    "branchName" TEXT NOT NULL DEFAULT 'Main Branch',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- Seed the single settings row.
INSERT INTO "app_settings" ("id", "businessName", "branchName", "updatedAt")
VALUES ('singleton', 'KJ Stationery', 'Main Branch', now());
