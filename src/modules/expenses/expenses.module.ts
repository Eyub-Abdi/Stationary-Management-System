import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { ExpenseCategoriesModule } from '../expense-categories/expense-categories.module';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';

@Module({
  imports: [ExpenseCategoriesModule, AccountingModule],
  controllers: [ExpensesController],
  providers: [ExpensesService],
})
export class ExpensesModule {}
