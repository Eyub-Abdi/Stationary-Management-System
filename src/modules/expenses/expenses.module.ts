import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { BankingModule } from '../banking/banking.module';
import { ExpenseCategoriesModule } from '../expense-categories/expense-categories.module';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';

@Module({
  // For the held-cash ledger, when a bill is paid from the money being held
  // rather than out of the drawer.
  imports: [ExpenseCategoriesModule, AccountingModule, BankingModule],
  controllers: [ExpensesController],
  providers: [ExpensesService],
})
export class ExpensesModule {}
