import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  NotEquals,
} from 'class-validator';

export class AdjustStockDto {
  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty({
    example: -3,
    description: 'Signed change. Positive = stock in, negative = stock out.',
  })
  @Type(() => Number)
  @IsInt()
  @NotEquals(0)
  quantityChange!: number;

  @ApiProperty({ example: 'Stock count correction / damaged goods' })
  @IsString()
  @IsNotEmpty()
  reason!: string;

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
