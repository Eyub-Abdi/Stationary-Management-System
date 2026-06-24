import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
import {
  productImageMulterOptions,
  productImageUrl,
} from '../uploads/upload.config';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditService } from '../audit/audit.service';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@ApiTags('Products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List products (filter, search, paginate)' })
  findAll(@Query() query: ProductQueryDto) {
    return this.products.findAll(query);
  }

  @Get('low-stock')
  @ApiOperation({ summary: 'Products at or below minimum stock level' })
  lowStock() {
    return this.products.lowStock();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.findOne(id);
  }

  @Roles(Role.ADMIN)
  @Post()
  @ApiOperation({ summary: 'Create a product (admin)' })
  async create(
    @Body() dto: CreateProductDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const product = await this.products.create(dto);
    await this.audit.record({
      userId: actor.id,
      action: 'PRODUCT_CREATED',
      entityType: 'Product',
      entityId: product.id,
      metadata: { sku: product.sku, sellingPrice: product.sellingPrice.toString() },
    });
    return product;
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  @ApiOperation({ summary: 'Update a product (admin). Does not affect history.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const before = await this.products.findOne(id);
    const product = await this.products.update(id, dto);
    await this.audit.record({
      userId: actor.id,
      action: 'PRODUCT_UPDATED',
      entityType: 'Product',
      entityId: id,
      metadata: {
        before: { sellingPrice: before.sellingPrice.toString() },
        changes: dto,
      },
    });
    return product;
  }

  @Roles(Role.ADMIN)
  @Post(':id/image')
  @ApiOperation({ summary: 'Upload/replace a product image (admin)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', productImageMulterOptions))
  async uploadImage(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded (field name must be "file")');
    }
    const url = productImageUrl(file.filename);
    const product = await this.products.setImage(id, url);
    await this.audit.record({
      userId: actor.id,
      action: 'PRODUCT_IMAGE_UPLOADED',
      entityType: 'Product',
      entityId: id,
      metadata: { imageUrl: url, filename: file.filename },
    });
    return product;
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate a product (soft, preserves history)' })
  async deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const product = await this.products.deactivate(id);
    await this.audit.record({
      userId: actor.id,
      action: 'PRODUCT_DEACTIVATED',
      entityType: 'Product',
      entityId: id,
    });
    return product;
  }

  @Roles(Role.ADMIN)
  @Delete(':id/permanent')
  @ApiOperation({
    summary: 'Permanently delete a product (admin, only if never transacted)',
  })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const before = await this.products.findOne(id);
    const result = await this.products.remove(id);
    await this.audit.record({
      userId: actor.id,
      action: 'PRODUCT_DELETED',
      entityType: 'Product',
      entityId: id,
      metadata: { sku: before.sku, name: before.name },
    });
    return result;
  }
}
