-- CreateEnum
CREATE TYPE "MoneyLocation" AS ENUM ('HAND', 'BANK');

-- CreateEnum
CREATE TYPE "BankTransactionType" AS ENUM ('OPENING_BALANCE', 'TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_OUT', 'LOAN_REPAYMENT', 'CHARGE', 'CORRECTION');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('OUTSTANDING', 'REPAID');

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" UUID NOT NULL,
    "type" "BankTransactionType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "userId" UUID NOT NULL,
    "cashSessionId" UUID,
    "loanId" UUID,
    "repaymentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loans" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "source" "MoneyLocation" NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "LoanStatus" NOT NULL DEFAULT 'OUTSTANDING',
    "notes" TEXT,
    "issuedById" UUID NOT NULL,
    "cashSessionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_repayments" (
    "id" UUID NOT NULL,
    "loanId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "destination" "MoneyLocation" NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "recordedById" UUID NOT NULL,
    "cashSessionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_repayments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bank_transactions_occurredAt_idx" ON "bank_transactions"("occurredAt");

-- CreateIndex
CREATE INDEX "bank_transactions_type_idx" ON "bank_transactions"("type");

-- CreateIndex
CREATE INDEX "bank_transactions_cashSessionId_idx" ON "bank_transactions"("cashSessionId");

-- CreateIndex
CREATE INDEX "loans_userId_idx" ON "loans"("userId");

-- CreateIndex
CREATE INDEX "loans_status_idx" ON "loans"("status");

-- CreateIndex
CREATE INDEX "loans_dueDate_idx" ON "loans"("dueDate");

-- CreateIndex
CREATE INDEX "loan_repayments_loanId_idx" ON "loan_repayments"("loanId");

-- CreateIndex
CREATE INDEX "loan_repayments_paidAt_idx" ON "loan_repayments"("paidAt");

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "loans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_repaymentId_fkey" FOREIGN KEY ("repaymentId") REFERENCES "loan_repayments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_repayments" ADD CONSTRAINT "loan_repayments_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_repayments" ADD CONSTRAINT "loan_repayments_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_repayments" ADD CONSTRAINT "loan_repayments_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
