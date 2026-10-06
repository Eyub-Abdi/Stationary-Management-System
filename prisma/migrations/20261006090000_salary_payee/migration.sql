-- Salaries get a page of their own but stay expenses: two columns say who was
-- paid and which month the pay covers.
ALTER TABLE "expenses" ADD COLUMN "payeeName" TEXT;
ALTER TABLE "expenses" ADD COLUMN "payPeriod" DATE;

CREATE INDEX "expenses_payeeName_idx" ON "expenses"("payeeName");

-- Until now the person paid was typed into the description. Move it across so
-- past salaries show up under the right name, and file each one under the
-- month it was paid in.
UPDATE "expenses" e
SET "payeeName"   = NULLIF(TRIM(e."description"), ''),
    "description" = NULL,
    "payPeriod"   = date_trunc('month', e."expenseDate")::date
FROM "expense_categories" c
WHERE e."categoryId" = c."id" AND c."systemKey" = 'SALARY';
