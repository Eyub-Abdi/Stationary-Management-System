-- Month-end close. A row exists per calendar month that has been closed at
-- least once; it snapshots the figures reported at close time and freezes the
-- entries behind them.

CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'CLOSED');

CREATE TABLE "accounting_periods" (
    "id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'CLOSED',
    "grossSales" DECIMAL(14,2) NOT NULL,
    "refunds" DECIMAL(14,2) NOT NULL,
    "revenue" DECIMAL(14,2) NOT NULL,
    "cogs" DECIMAL(14,2) NOT NULL,
    "grossProfit" DECIMAL(14,2) NOT NULL,
    "expenses" DECIMAL(14,2) NOT NULL,
    "netProfit" DECIMAL(14,2) NOT NULL,
    "purchases" DECIMAL(14,2) NOT NULL,
    "saleCount" INTEGER NOT NULL,
    "notes" TEXT,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedById" UUID NOT NULL,
    "reopenedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_periods_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "accounting_periods_year_month_key" ON "accounting_periods"("year", "month");
CREATE INDEX "accounting_periods_status_idx" ON "accounting_periods"("status");

ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_closedById_fkey"
    FOREIGN KEY ("closedById") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
