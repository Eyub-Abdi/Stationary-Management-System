-- AlterEnum
ALTER TYPE "SequenceType" ADD VALUE 'RETURN';

-- AlterTable
ALTER TABLE "cogs_allocations" ADD COLUMN     "returnedQuantity" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sale_items" ADD COLUMN     "returnedQuantity" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "sale_returns" (
    "id" UUID NOT NULL,
    "returnNumber" TEXT NOT NULL,
    "saleId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "cashSessionId" UUID,
    "reason" TEXT NOT NULL,
    "totalRefund" DECIMAL(14,2) NOT NULL,
    "totalCogsReversed" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_return_items" (
    "id" UUID NOT NULL,
    "returnId" UUID NOT NULL,
    "saleItemId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "refundAmount" DECIMAL(14,2) NOT NULL,
    "cogsReversed" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "sale_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sale_returns_returnNumber_key" ON "sale_returns"("returnNumber");

-- CreateIndex
CREATE INDEX "sale_returns_saleId_idx" ON "sale_returns"("saleId");

-- CreateIndex
CREATE INDEX "sale_returns_userId_idx" ON "sale_returns"("userId");

-- CreateIndex
CREATE INDEX "sale_returns_cashSessionId_idx" ON "sale_returns"("cashSessionId");

-- CreateIndex
CREATE INDEX "sale_returns_createdAt_idx" ON "sale_returns"("createdAt");

-- CreateIndex
CREATE INDEX "sale_return_items_returnId_idx" ON "sale_return_items"("returnId");

-- CreateIndex
CREATE INDEX "sale_return_items_saleItemId_idx" ON "sale_return_items"("saleItemId");

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "sale_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "sale_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
