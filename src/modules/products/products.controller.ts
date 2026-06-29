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
import {
  productImageMulterOptions,
  productImageUrl,
} from '../uploads/upload.config';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Permission } from '../../common/decorators/permission.decorator';
import { AuditService } from '../audit/audit.service';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
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
  @ApiOperation({ summary: 'List products with their variants (filter, search, paginate)' })
  findAll(@Query() query: ProductQueryDto) {
    return this.products.findAll(query);
  }

  @Get('low-stock')
  @ApiOperation({ summary: 'Variants at or below minimum stock level' })
  lowStock() {
    return this.products.lowStock();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.findOne(id);
  }

  @Permission('products')
  @Post()
  @ApiOperation({ summary: 'Create a product with one or more variants (admin)' })
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
      metadata: { sku: product.sku, variantCount: product.variants.length },
    });
    return product;
  }

  @Permission('products')
  @Patch(':id')
  @ApiOperation({ summary: 'Update a product (admin). Does not affect history.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const product = await this.products.update(id, dto);
    await this.audit.record({
      userId: actor.id,
      action: 'PRODUCT_UPDATED',
      entityType: 'Product',
      entityId: id,
      metadata: { changes: dto },
    });
    return product;
  }

  // ---- Variants -----------------------------------------------------------

  @Permission('products')
  @Post(':id/variants')
  @ApiOperation({ summary: 'Add a variant to a product (admin)' })
  async addVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateVariantDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const variant = await this.products.addVariant(id, dto);
    await this.audit.record({
      userId: actor.id,
      action: 'VARIANT_CREATED',
      entityType: 'ProductVariant',
      entityId: variant.id,
      metadata: { productId: id, sku: variant.sku, label: variant.label },
    });
    return variant;
  }

  @Permission('products')
  @Patch('variants/:variantId')
  @ApiOperation({ summary: 'Update a variant (admin). Does not affect history.' })
  async updateVariant(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: UpdateVariantDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const variant = await this.products.updateVariant(variantId, dto);
    await this.audit.record({
      userId: actor.id,
      action: 'VARIANT_UPDATED',
      entityType: 'ProductVariant',
      entityId: variantId,
      metadata: { changes: dto },
    });
    return variant;
  }

  @Permission('products')
  @Delete('variants/:variantId')
  @ApiOperation({ summary: 'Deactivate a variant (soft, preserves history)' })
  async deactivateVariant(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const variant = await this.products.deactivateVariant(variantId);
    await this.audit.record({
      userId: actor.id,
      action: 'VARIANT_DEACTIVATED',
      entityType: 'ProductVariant',
      entityId: variantId,
    });
    return variant;
  }

  @Permission('products')
  @Delete('variants/:variantId/permanent')
  @ApiOperation({ summary: 'Permanently delete a variant (admin, only if never transacted)' })
  async removeVariant(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const result = await this.products.removeVariant(variantId);
    await this.audit.record({
      userId: actor.id,
      action: 'VARIANT_DELETED',
      entityType: 'ProductVariant',
      entityId: variantId,
    });
    return result;
  }

  @Permission('products')
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

  @Permission('products')
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

  @Permission('products')
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
