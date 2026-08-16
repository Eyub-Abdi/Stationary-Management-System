import { Module } from '@nestjs/common';
import { CashController } from './cash.controller';
import { CashService } from './cash.service';

@Module({
  controllers: [CashController],
  providers: [CashService],
  // Reports asks it where the cash in hand stands, rather than restating the
  // expected-cash formula in a second place.
  exports: [CashService],
})
export class CashModule {}
