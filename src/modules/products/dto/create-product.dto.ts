import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CreateVariantDto } from './create-variant.dto';

export class CreateProductDto {
  @ApiPropertyOptional({
    example: 'A4-RM-001',
    description: 'Optional product group code. Auto-generated from the name when omitted.',
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

  @ApiPropertyOptional({ example: 'pcs', default: 'pcs', description: 'Name of the single sellable unit (piece).' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  baseUnit?: string;

  @ApiPropertyOptional({ enum: ProductStatus, default: ProductStatus.ACTIVE })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiProperty({
    type: [CreateVariantDto],
    description: 'At least one variant. A single-variant product behaves like a plain product.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  @IsNotEmpty()
  variants!: CreateVariantDto[];
}
