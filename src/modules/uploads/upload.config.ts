import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { Request } from 'express';
import { existsSync, mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';

/**
 * Local-disk storage for product images. Files live under `uploads/products`
 * and are served read-only at `/uploads/...` (see main.ts useStaticAssets).
 *
 * To move to object storage (S3/GCS) later, swap `diskStorage` for a custom
 * storage engine and return the public URL — the controller/service contract
 * (an `imageUrl` string) does not change.
 */
export const UPLOAD_ROOT = join(process.cwd(), 'uploads');
export const PRODUCT_IMAGE_DIR = join(UPLOAD_ROOT, 'products');
export const PRODUCT_IMAGE_PUBLIC_PREFIX = '/uploads/products';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

// Ensure the directory exists at startup (diskStorage will not create it).
if (!existsSync(PRODUCT_IMAGE_DIR)) {
  mkdirSync(PRODUCT_IMAGE_DIR, { recursive: true });
}

export const productImageMulterOptions: MulterOptions = {
  storage: diskStorage({
    destination: PRODUCT_IMAGE_DIR,
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase() || '.img';
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: MAX_SIZE_BYTES, files: 1 },
  fileFilter: (
    _req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(
        new BadRequestException(
          `Unsupported image type "${file.mimetype}". Allowed: JPEG, PNG, WEBP, GIF.`,
        ),
        false,
      );
    }
    cb(null, true);
  },
};

/** Public URL for a stored product image filename. */
export const productImageUrl = (filename: string): string =>
  `${PRODUCT_IMAGE_PUBLIC_PREFIX}/${filename}`;
