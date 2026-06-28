-- Office / internal-use purchases: itemized buying of goods consumed in-house
-- (not for resale). Modeled as an Expense (category OFFICE_SUPPLIES) with line
-- items, so it flows into the till close and P&L like any other expense without
-- ever creating sellable stock.

-- AlterEnum
ALTER TYPE "ExpenseCategory" ADD VALUE 'OFFICE_SUPPLIES';

-- AlterTable: optional free-text vendor for itemized expenses.
ALTER TABLE "expenses" ADD COLUMN "supplierName" TEXT;

-- CreateTable
CREATE TABLE "expense_items" (
    "id" UUID NOT NULL,
    "expenseId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "expense_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expense_items_expenseId_idx" ON "expense_items"("expenseId");

-- AddForeignKey
ALTER TABLE "expense_items" ADD CONSTRAINT "expense_items_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
