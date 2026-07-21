-- Expense categories become an admin-managed table instead of a fixed enum.
-- The original enum values are seeded as rows (keeping their systemKey), every
-- existing expense is re-pointed at the matching row, and only then is the enum
-- column dropped — no expense history is lost.

CREATE TABLE "expense_categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'category',
    "staffAllowed" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "systemKey" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "expense_categories_name_key" ON "expense_categories"("name");
CREATE UNIQUE INDEX "expense_categories_systemKey_key" ON "expense_categories"("systemKey");
CREATE INDEX "expense_categories_isActive_idx" ON "expense_categories"("isActive");

-- Seed the previously hardcoded set. staffAllowed mirrors the old
-- PETTY_CASH_CATEGORIES list; the rest stay management-only.
INSERT INTO "expense_categories" ("id", "name", "icon", "staffAllowed", "systemKey", "sortOrder", "updatedAt")
VALUES
    (gen_random_uuid(), 'Rent',                'home_work',       false, 'RENT',            10, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Salary',              'badge',           false, 'SALARY',          20, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Electricity',         'bolt',            false, 'ELECTRICITY',     30, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Internet',            'wifi',            false, 'INTERNET',        40, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Toner',               'opacity',         true,  'TONER',           50, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Paper',               'description',     true,  'PAPER',           60, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Transport',           'local_shipping',  true,  'TRANSPORT',       70, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Food',                'restaurant',      true,  'FOOD',            80, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Office / Internal Use','business_center', false, 'OFFICE_SUPPLIES', 90, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Miscellaneous',       'category',        true,  'MISCELLANEOUS',  100, CURRENT_TIMESTAMP);

-- Re-point existing expenses at the seeded rows.
ALTER TABLE "expenses" ADD COLUMN "categoryId" UUID;

UPDATE "expenses" e
SET "categoryId" = c."id"
FROM "expense_categories" c
WHERE c."systemKey" = e."category"::text;

ALTER TABLE "expenses" ALTER COLUMN "categoryId" SET NOT NULL;

DROP INDEX IF EXISTS "expenses_category_idx";
ALTER TABLE "expenses" DROP COLUMN "category";
DROP TYPE "ExpenseCategory";

CREATE INDEX "expenses_categoryId_idx" ON "expenses"("categoryId");
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "expense_categories"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
