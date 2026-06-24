-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "creditLimit" DECIMAL(14,2);

-- CreateTable
CREATE TABLE "customer_payment_allocations" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_payment_allocations_paymentId_idx" ON "customer_payment_allocations"("paymentId");

-- CreateIndex
CREATE INDEX "customer_payment_allocations_saleId_idx" ON "customer_payment_allocations"("saleId");

-- AddForeignKey
ALTER TABLE "customer_payment_allocations" ADD CONSTRAINT "customer_payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "customer_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payment_allocations" ADD CONSTRAINT "customer_payment_allocations_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
