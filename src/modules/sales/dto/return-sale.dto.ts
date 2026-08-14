import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ReturnLineDto {
  @ApiProperty({ description: 'The sale item (line) being returned' })
  @IsUUID()
  saleItemId!: string;

  @ApiProperty({ example: 2, description: 'Units to return (≤ remaining returnable qty).' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class ReturnSaleDto {
  @ApiPropertyOptional({
    deprecated: true,
    description:
      'Ignored. The refund is paid from the shop’s one shared open cash session.',
  })
  @IsOptional()
  @IsUUID()
  cashSessionId?: string;

  @ApiProperty({ type: [ReturnLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReturnLineDto)
  @IsNotEmpty()
  items!: ReturnLineDto[];

  @ApiProperty({ example: 'Customer returned 2 defective pens' })
  @IsString()
  @MinLength(5)
  @MaxLength(255)
  reason!: string;
}
