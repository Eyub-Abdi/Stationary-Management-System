import { Module } from '@nestjs/common';
import { BankService } from './bank.service';
import { BankingController } from './banking.controller';
import { HandService } from './hand.service';
import { LoansService } from './loans.service';

@Module({
  controllers: [BankingController],
  providers: [BankService, HandService, LoansService],
  exports: [BankService, HandService, LoansService],
})
export class BankingModule {}
