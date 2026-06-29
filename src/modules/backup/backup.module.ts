import { Module } from '@nestjs/common';
import { AutoBackupService } from './auto-backup.service';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';

@Module({
  controllers: [BackupController],
  providers: [BackupService, AutoBackupService],
  exports: [BackupService],
})
export class BackupModule {}
