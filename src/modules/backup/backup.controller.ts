import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { rm } from 'fs/promises';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Permission } from '../../common/decorators/permission.decorator';
import { AuditService } from '../audit/audit.service';
import { BackupService } from './backup.service';
import { backupMulterOptions } from './backup.upload';
import { RestoreLocalDto } from './dto/restore.dto';

/**
 * Database backup & restore (admin only). Backups download a compressed dump the
 * owner keeps off-server; restore replaces the live database from an uploaded
 * dump. Destructive — the frontend gates it behind a typed confirmation.
 */
@ApiTags('Backup')
@ApiBearerAuth()
@Permission('settings')
@Controller('admin')
export class BackupController {
  private readonly logger = new Logger(BackupController.name);

  constructor(
    private readonly backup: BackupService,
    private readonly audit: AuditService,
  ) {}

  @Post('backup/local')
  @ApiOperation({ summary: 'Write a backup to the configured on-disk folder now (admin).' })
  async backupToDisk(@CurrentUser() user: AuthenticatedUser) {
    const result = await this.backup.runLocalBackup();
    await this.audit.record({
      userId: user.id,
      action: 'DB_BACKUP_LOCAL',
      entityType: 'Database',
      entityId: result.filename,
      metadata: { dir: result.dir, sizeBytes: result.sizeBytes },
    });
    return result;
  }

  @Post('backup')
  @ApiOperation({ summary: 'Create and download a full database backup (admin).' })
  async download(@CurrentUser() user: AuthenticatedUser, @Res() res: Response) {
    const { path, filename } = await this.backup.createDump();
    await this.audit.record({
      userId: user.id,
      action: 'DB_BACKUP_CREATED',
      entityType: 'Database',
      entityId: filename,
      metadata: { filename },
    });
    res.download(path, filename, () => {
      // Best-effort cleanup of the temp dump once streamed (or on error).
      void rm(path, { force: true });
    });
  }

  @Get('backups')
  @ApiOperation({
    summary:
      'List dumps in the backup folder, newest first, with what each one contains (admin).',
  })
  listBackups() {
    return this.backup.listBackups();
  }

  @Post('restore/local')
  @ApiOperation({
    summary: 'Restore from a dump already in the backup folder, by filename (admin).',
  })
  async restoreLocal(
    @Body() dto: RestoreLocalDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const path = await this.backup.resolveBackupFile(dto.filename);
    return this.applyRestore(path, dto.filename, user, dto.acknowledgeOlder ?? false);
  }

  @Post('restore')
  @ApiOperation({
    summary: 'Restore the database from an uploaded backup, replacing all data (admin).',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        acknowledgeOlder: { type: 'string', enum: ['true', 'false'] },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', backupMulterOptions))
  async restore(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: Express.Multer.File,
    // Multipart fields arrive as strings.
    @Body('acknowledgeOlder') acknowledgeOlder?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No backup file uploaded (field name must be "file").');
    }
    try {
      return await this.applyRestore(
        file.path,
        file.originalname,
        user,
        acknowledgeOlder === 'true',
      );
    } finally {
      void rm(file.path, { force: true });
    }
  }

  /** Shared by both restore routes: restore, then record it best-effort. */
  private async applyRestore(
    path: string,
    label: string,
    user: AuthenticatedUser,
    acknowledgeOlder: boolean,
  ) {
    const inspection = await this.backup.restoreDump(path, acknowledgeOlder);

    // The restore has already committed. Everything past this point is
    // bookkeeping and must never turn a successful restore into a reported
    // failure: the restored database has the dump's users table, so this row
    // can legitimately violate the audit_logs -> users foreign key when the
    // signed-in account does not exist in the backup being restored.
    try {
      await this.audit.record({
        userId: user.id,
        action: 'DB_RESTORED',
        entityType: 'Database',
        entityId: label,
        metadata: {
          filename: label,
          rolledBack: inspection.isBehind,
          migrationsApplied: inspection.missingMigrations.length,
        },
      });
    } catch (e) {
      this.logger.warn(
        `Database restored from ${label}, but the audit record could not be written: ${(e as Error).message}`,
      );
    }

    // The signed-in session was issued against the previous database, so the
    // client must sign in again and the process should be restarted.
    return {
      ok: true,
      restoredFrom: label,
      restartRequired: true,
      rolledBack: inspection.isBehind,
      migrationsApplied: inspection.migrationError
        ? 0
        : inspection.missingMigrations.length,
      // Present only when the data restored but the schema catch-up did not.
      migrationError: inspection.migrationError,
    };
  }
}
