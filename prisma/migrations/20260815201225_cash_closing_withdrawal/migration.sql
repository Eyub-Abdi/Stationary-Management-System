-- AlterTable
ALTER TABLE "app_settings" ALTER COLUMN "id" SET DEFAULT 'singleton';

-- AlterTable
ALTER TABLE "cash_sessions" ADD COLUMN     "closingWithdrawal" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "permissions" DROP DEFAULT;
