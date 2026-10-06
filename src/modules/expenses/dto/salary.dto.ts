import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { PaymentSource } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export class CreateSalaryDto {
  @ApiProperty({ example: 'Warda Hamid', description: 'Who was paid' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  payeeName!: string;

  @ApiProperty({ example: '2026-09', description: 'The month this pay covers (YYYY-MM)' })
  @Matches(MONTH, { message: 'payPeriod must be a month in YYYY-MM form' })
  payPeriod!: string;

  @ApiProperty({ example: 80000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @ApiProperty({ type: String, format: 'date-time', description: 'The day the money was handed over' })
  @Type(() => Date)
  @IsDate()
  paidOn!: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    enum: PaymentSource,
    default: PaymentSource.TILL,
    description:
      'Which pot the money came out of. TILL needs an open session and shows in its count. HELD_CASH pays straight from the cash being held at the shop.',
  })
  @IsOptional()
  @IsEnum(PaymentSource)
  paidFrom?: PaymentSource;
}

/** The source is a fact about the payment, not a field to revise afterwards. */
export class UpdateSalaryDto extends PartialType(
  OmitType(CreateSalaryDto, ['paidFrom'] as const),
) {}

export class SalaryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Only payments to this person' })
  @IsOptional()
  @IsString()
  payeeName?: string;

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

/** "2026-09" → the first of that month, which is how a pay period is stored. */
export function monthStart(month: string): Date {
  return new Date(`${month}-01T00:00:00.000Z`);
}
