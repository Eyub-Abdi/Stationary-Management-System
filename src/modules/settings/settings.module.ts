import { Module } from '@nestjs/common';
import { BackupModule } from '../backup/backup.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [BackupModule],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
