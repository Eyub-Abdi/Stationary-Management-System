-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CREDIT');

-- CreateEnum
CREATE TYPE "SellUnit" AS ENUM ('BASE', 'BULK');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "baseUnit" TEXT NOT NULL DEFAULT 'pcs',
ADD COLUMN     "bulkSellingPrice" DECIMAL(14,2),
ADD COLUMN     "bulkUnit" TEXT,
ADD COLUMN     "unitSize" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "purchase_items" ADD COLUMN     "unitLabel" TEXT NOT NULL DEFAULT 'pcs',
ADD COLUMN     "unitSize" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "amountDue" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "amountPaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "cashSessionId" UUID,
ADD COLUMN     "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH';

-- AlterTable
ALTER TABLE "sale_items" ADD COLUMN     "unitLabel" TEXT NOT NULL DEFAULT 'pcs',
ADD COLUMN     "unitSize" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "amountDue" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "amountPaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "customerId" UUID,
ADD COLUMN     "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH';

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "balance" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_payments" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "cashSessionId" UUID,
    "saleId" UUID,
    "amount" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "cashSessionId" UUID,
    "purchaseId" UUID,
    "amount" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_name_idx" ON "customers"("name");

-- CreateIndex
CREATE INDEX "customer_payments_customerId_idx" ON "customer_payments"("customerId");

-- CreateIndex
CREATE INDEX "customer_payments_cashSessionId_idx" ON "customer_payments"("cashSessionId");

-- CreateIndex
CREATE INDEX "customer_payments_createdAt_idx" ON "customer_payments"("createdAt");

-- CreateIndex
CREATE INDEX "supplier_payments_supplierId_idx" ON "supplier_payments"("supplierId");

-- CreateIndex
CREATE INDEX "supplier_payments_cashSessionId_idx" ON "supplier_payments"("cashSessionId");

-- CreateIndex
CREATE INDEX "supplier_payments_createdAt_idx" ON "supplier_payments"("createdAt");

-- CreateIndex
CREATE INDEX "purchases_cashSessionId_idx" ON "purchases"("cashSessionId");

-- CreateIndex
CREATE INDEX "sales_customerId_idx" ON "sales"("customerId");

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
