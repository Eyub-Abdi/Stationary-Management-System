import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod, PaymentSource } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDate,
  IsEnum,
  IsIn,
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

  @ApiPropertyOptional({
    enum: PaymentMethod,
    default: PaymentMethod.CASH,
    description:
      'CASH pays it out of the open till now. CREDIT records the cost and leaves it owed to the vendor, to be paid later.',
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({
    example: 10000,
    description:
      'Part-payment handed over now, on a CREDIT purchase. Defaults to 0 — the whole total is left owed. Ignored for CASH.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amountPaid?: number;

  @ApiPropertyOptional({
    enum: PaymentSource,
    default: PaymentSource.TILL,
    description:
      'Which pot paid for it. HELD_CASH spends the cash being held at the shop and touches no till. Ignored when nothing is paid now.',
  })
  @IsOptional()
  @IsEnum(PaymentSource)
  paidFrom?: PaymentSource;

  @ApiProperty({ type: [OfficePurchaseItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OfficePurchaseItemDto)
  @IsNotEmpty()
  items!: OfficePurchaseItemDto[];
}

/** A payment handed to the vendor against an office purchase bought on credit. */
export class PayOfficePurchaseDto {
  @ApiProperty({ example: 25000, description: 'Amount paid now, out of the open till.' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional({ description: 'Optional notes, e.g. who was paid.' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    enum: PaymentSource,
    default: PaymentSource.TILL,
    description:
      'Which pot the money comes out of. HELD_CASH pays the vendor from the cash being held at the shop, so no till is involved and none needs to be open.',
  })
  @IsOptional()
  @IsEnum(PaymentSource)
  paidFrom?: PaymentSource;
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

  @ApiPropertyOptional({
    enum: ['UNPAID', 'PAID'],
    description: 'UNPAID lists only what is still owed to vendors.',
  })
  @IsOptional()
  @IsIn(['UNPAID', 'PAID'])
  settlement?: 'UNPAID' | 'PAID';
}
