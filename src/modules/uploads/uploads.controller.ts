import {
  BadRequestException,
  Controller,
  Post,
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
import { Roles } from '../../common/decorators/roles.decorator';
import { productImageMulterOptions, productImageUrl } from './upload.config';

/**
 * Generic image upload. The frontend's "Add product" form uploads the image
 * here first, receives `{ url }`, and includes that `imageUrl` in the
 * subsequent POST /products call. (Use POST /products/:id/image to attach an
 * image to an existing product in one step.)
 */
@ApiTags('Uploads')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('uploads')
export class UploadsController {
  @Post('image')
  @ApiOperation({ summary: 'Upload a product image; returns its public URL (admin)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', productImageMulterOptions))
  upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded (field name must be "file")');
    }
    return {
      url: productImageUrl(file.filename),
      filename: file.filename,
      mimeType: file.mimetype,
      size: file.size,
    };
  }
}
