import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StockAdjustmentReason } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { POS_WASTAGE_REASONS } from '../adjustment-reasons';

/**
 * Stock destroyed while working, recorded where it happens. Either name the
 * service option that ate it — a jam on "Printing A4" writes off the sheets its
 * bill of materials says a page costs — or name the product directly.
 */
export class RecordWastageDto {
  @ApiPropertyOptional({
    description:
      'The service option the loss happened on. Its bill of materials decides which products are written off.',
  })
  @IsOptional()
  @IsUUID()
  serviceVariantId?: string;

  @ApiPropertyOptional({
    description: 'Write off a product directly instead of through a service.',
  })
  @IsOptional()
  @IsUUID()
  variantId?: string;

  @ApiProperty({
    example: 3,
    description:
      'How many were lost: pages spoiled when a serviceVariantId is given, otherwise base units of the product.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  // A jam is a handful of sheets. A four-figure entry is a typo or a recount,
  // and a recount is not the cashier's to make.
  @Max(1000)
  quantity!: number;

  @ApiProperty({ enum: POS_WASTAGE_REASONS })
  @IsEnum(StockAdjustmentReason)
  @IsIn(POS_WASTAGE_REASONS, {
    message: `reasonCode must be one of: ${POS_WASTAGE_REASONS.join(', ')}`,
  })
  reasonCode!: StockAdjustmentReason;

  @ApiPropertyOptional({ example: 'Feeder pulled two sheets at once' })
  @IsOptional()
  @IsString()
  notes?: string;
}
