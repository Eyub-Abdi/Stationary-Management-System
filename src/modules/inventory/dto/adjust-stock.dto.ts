import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StockAdjustmentReason } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  NotEquals,
} from 'class-validator';

export class AdjustStockDto {
  @ApiProperty({ description: 'The product variant to adjust.' })
  @IsUUID()
  variantId!: string;

  @ApiProperty({
    example: -3,
    description: 'Signed change. Positive = stock in, negative = stock out.',
  })
  @Type(() => Number)
  @IsInt()
  @NotEquals(0)
  quantityChange!: number;

  @ApiProperty({
    enum: StockAdjustmentReason,
    description: 'Why the stock changed. Drives the wastage report.',
  })
  @IsEnum(StockAdjustmentReason)
  reasonCode!: StockAdjustmentReason;

  @ApiPropertyOptional({
    example: 'Ream soaked when the roof leaked',
    description: 'Free-text detail. Defaults to the label of the chosen reason.',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    example: 9000,
    description: 'Unit cost for positive adjustments (creates a FIFO batch). Defaults to product reference buying price.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost?: number;
}
