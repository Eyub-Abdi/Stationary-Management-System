import {
  BadRequestException,
  Controller,
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
import { Role } from '@prisma/client';
import { Response } from 'express';
import { rm } from 'fs/promises';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditService } from '../audit/audit.service';
import { BackupService } from './backup.service';
import { backupMulterOptions } from './backup.upload';

/**
 * Database backup & restore (admin only). Backups download a compressed dump the
 * owner keeps off-server; restore replaces the live database from an uploaded
 * dump. Destructive — the frontend gates it behind a typed confirmation.
 */
@ApiTags('Backup')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin')
export class BackupController {
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

  @Post('restore')
  @ApiOperation({
    summary: 'Restore the database from an uploaded backup, replacing all data (admin).',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @UseInterceptors(FileInterceptor('file', backupMulterOptions))
  async restore(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No backup file uploaded (field name must be "file").');
    }
    try {
      await this.backup.restoreDump(file.path);
      await this.audit.record({
        userId: user.id,
        action: 'DB_RESTORED',
        entityType: 'Database',
        entityId: file.originalname,
        metadata: { filename: file.originalname, size: file.size },
      });
      return { ok: true, restoredFrom: file.originalname };
    } finally {
      void rm(file.path, { force: true });
    }
  }
}
