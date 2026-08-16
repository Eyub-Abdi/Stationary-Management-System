import { Module } from '@nestjs/common';
import { CashModule } from '../cash/cash.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [CashModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
