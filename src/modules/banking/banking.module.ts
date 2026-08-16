import { Module } from '@nestjs/common';
import { BankService } from './bank.service';
import { BankingController } from './banking.controller';
import { LoansService } from './loans.service';

@Module({
  controllers: [BankingController],
  providers: [BankService, LoansService],
  exports: [BankService, LoansService],
})
export class BankingModule {}
