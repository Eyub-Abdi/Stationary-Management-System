import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @ApiPropertyOptional({
    example: 'A4-RM-001',
    description: 'Optional. Auto-generated from the product name when omitted.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Za-z0-9-_]+$/, { message: 'SKU may contain letters, numbers, - and _' })
  sku?: string;

  @ApiProperty({ example: 'A4 Paper (Ream)' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Public image URL, e.g. value returned by POST /uploads/image',
    example: '/uploads/products/3f2c....png',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiProperty({ example: 12000, description: 'Selling price per base unit / piece (2 dp).' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sellingPrice!: number;

  @ApiPropertyOptional({ example: 9000, description: 'Reference buying price per base unit (true COGS comes from purchase batches).' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  buyingPrice?: number;

  // --- Dual unit of measure -------------------------------------------------

  @ApiPropertyOptional({ example: 'pcs', default: 'pcs', description: 'Name of the smallest sellable unit (piece).' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  baseUnit?: string;

  @ApiPropertyOptional({ example: 'Box', description: 'Optional larger packaging unit. Enables selling/buying by the pack.' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  bulkUnit?: string;

  @ApiPropertyOptional({ example: 12, default: 1, description: 'Base units (pieces) contained in one bulk unit.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  unitSize?: number;

  @ApiPropertyOptional({ example: 130000, description: 'Selling price for one whole bulk unit. Defaults to sellingPrice × unitSize.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  bulkSellingPrice?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minStockLevel?: number;

  @ApiPropertyOptional({ enum: ProductStatus, default: ProductStatus.ACTIVE })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;
}
