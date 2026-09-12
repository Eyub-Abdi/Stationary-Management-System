import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { PaymentSource } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class CreateExpenseDto {
  @ApiProperty({ format: 'uuid', description: 'Expense category id' })
  @IsUUID()
  categoryId!: string;

  @ApiProperty({ example: 15000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  expenseDate!: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    enum: PaymentSource,
    default: PaymentSource.TILL,
    description:
      'Which pot the money came out of. TILL needs an open session and shows in its count. HELD_CASH pays straight from the cash being held at the shop and touches no till.',
  })
  @IsOptional()
  @IsEnum(PaymentSource)
  paidFrom?: PaymentSource;
}

/** The source is a fact about the payment, not a field to revise afterwards. */
export class UpdateExpenseDto extends PartialType(
  OmitType(CreateExpenseDto, ['paidFrom'] as const),
) {}

export class ExpenseQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

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
