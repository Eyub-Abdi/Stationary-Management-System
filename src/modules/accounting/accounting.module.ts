import { Module } from '@nestjs/common';
import { AccountingPeriodsController } from './accounting-periods.controller';
import { AccountingPeriodsService } from './accounting-periods.service';

@Module({
  controllers: [AccountingPeriodsController],
  providers: [AccountingPeriodsService],
  // Exported so writes that would move a closed month's figures can call
  // assertOpen() — expenses, sale voids and backdated purchases.
  exports: [AccountingPeriodsService],
})
export class AccountingModule {}
