import { Module } from '@nestjs/common';
import { BankingModule } from '../banking/banking.module';
import { CashController } from './cash.controller';
import { CashService } from './cash.service';

@Module({
  // For the bank ledger when a close says the takings went to the bank. The
  // dependency runs one way only — banking reaches the till through the
  // standalone helpers in expected-cash.ts, not through this module.
  imports: [BankingModule],
  controllers: [CashController],
  providers: [CashService],
  // Reports asks it where the cash in hand stands, rather than restating the
  // expected-cash formula in a second place.
  exports: [CashService],
})
export class CashModule {}
