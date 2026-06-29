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
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

/** A single sellable variant of a product (own SKU, price, stock, cost). */
export class CreateVariantDto {
  @ApiPropertyOptional({
    example: 'PEN-BLU',
    description: 'Optional. Auto-generated from the product name + label when omitted.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Za-z0-9-_]+$/, { message: 'SKU may contain letters, numbers, - and _' })
  sku?: string;

  @ApiProperty({ example: 'Blue', description: 'Variant label shown at the counter.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  label!: string;

  @ApiPropertyOptional({
    example: 500,
    description: 'Selling price per base unit / piece (2 dp). Optional — usually set when stock is first purchased.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sellingPrice?: number;

  @ApiPropertyOptional({ example: 350, description: 'Reference buying price per base unit (true COGS comes from purchase batches).' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  buyingPrice?: number;

  @ApiPropertyOptional({ example: 450, description: 'Optional wholesale price per piece (2 dp). Usually set when stock is purchased.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  wholesalePrice?: number;

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
