import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDate,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * One line of the shelf as it stood on day one.
 *
 * Shaped like a purchase line on purpose: whoever is setting the shop up is
 * reading off a delivery note or a shelf count, and both come in packs. The
 * quantity and the cost are BOTH in the transacted unit, and `unitSize`
 * converts them down — 4 boxes at 50,000 with a unitSize of 500 is 2,000 pieces
 * at 100 each. Getting that division wrong is the one mistake that poisons COGS
 * for as long as the batch lasts, so the cost guard checks the result.
 */
export class OpeningStockItemDto {
  @ApiProperty({ description: 'The product variant this stock belongs to.' })
  @IsUUID()
  variantId!: string;

  @ApiProperty({
    example: 4,
    description: 'How many of the transacted unit are on the shelf.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({
    example: 500,
    default: 1,
    description: 'Pieces per transacted unit. 1 for loose pieces, 500 for a ream of 500.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  unitSize?: number;

  @ApiPropertyOptional({
    example: 'ream',
    description: 'What the transacted unit is called. Defaults to the product base unit.',
  })
  @IsOptional()
  @IsString()
  unitLabel?: string;

  @ApiProperty({
    example: 50000,
    description: 'What ONE transacted unit cost. Divided by unitSize for FIFO.',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost!: number;

  @ApiPropertyOptional({
    example: 150,
    description: 'Selling price per base unit. Required if the variant has none yet.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sellingPrice?: number;

  @ApiPropertyOptional({ description: 'Wholesale price per base unit.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  wholesalePrice?: number;
}

export class RecordOpeningStockDto {
  @ApiProperty({ type: [OpeningStockItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OpeningStockItemDto)
  items!: OpeningStockItemDto[];

  @ApiPropertyOptional({
    description:
      'The day this stock was counted. Dates the FIFO batches, so stock that ' +
      'was already there is consumed before anything bought afterwards. ' +
      'Defaults to now.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  countedAt?: Date;

  @ApiPropertyOptional({ example: 'Shelf count, morning of 1 September' })
  @IsOptional()
  @IsString()
  notes?: string;
}
