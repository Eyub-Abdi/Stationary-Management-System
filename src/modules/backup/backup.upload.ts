import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { existsSync, mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { BACKUP_TMP_DIR } from './backup.service';

const MAX_SIZE_BYTES = 1024 * 1024 * 1024; // 1 GB — dumps stay small but be generous.

if (!existsSync(BACKUP_TMP_DIR)) mkdirSync(BACKUP_TMP_DIR, { recursive: true });

/** Stores an uploaded backup to a temp file; the controller removes it after restore. */
export const backupMulterOptions: MulterOptions = {
  storage: diskStorage({
    destination: BACKUP_TMP_DIR,
    filename: (_req, _file, cb) => cb(null, `restore_${randomUUID()}.dump`),
  }),
  limits: { fileSize: MAX_SIZE_BYTES, files: 1 },
};
