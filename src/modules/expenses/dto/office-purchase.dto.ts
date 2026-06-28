import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDate,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

/** A single free-typed line of an office/internal-use purchase. */
export class OfficePurchaseItemDto {
  @ApiProperty({ example: 'Printer paper (A4 ream)', description: 'What was bought.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty({ example: 8000, description: 'Cost per unit (2 dp).' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost!: number;
}

/** Records goods bought for internal/office use — booked as a cost, never stock. */
export class CreateOfficePurchaseDto {
  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  purchaseDate!: Date;

  @ApiPropertyOptional({ example: 'Acme Supplies', description: 'Optional free-text vendor.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  supplierName?: string;

  @ApiPropertyOptional({ description: 'Optional notes.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ type: [OfficePurchaseItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OfficePurchaseItemDto)
  @IsNotEmpty()
  items!: OfficePurchaseItemDto[];
}

export class OfficePurchaseQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}
