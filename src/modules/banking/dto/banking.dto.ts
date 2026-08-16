import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LoanStatus, MoneyLocation } from '@prisma/client';
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

export class TransferDto {
  @ApiProperty({ example: 500000, description: 'Amount to move.' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional({ description: 'e.g. deposit slip number.' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class OpeningBalanceDto {
  @ApiProperty({ example: 1200000, description: "What is in the bank today." })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class BankCorrectionDto {
  @ApiProperty({
    example: -2500,
    description:
      'Signed: negative takes money off the balance, positive adds it. Use after checking a statement.',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  amount!: number;

  @ApiProperty({ description: 'Why the balance was wrong — required.' })
  @IsString()
  reason!: string;
}

export class IssueLoanDto {
  @ApiProperty({ description: 'The shop member taking the money.' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ example: 200000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @ApiProperty({ enum: MoneyLocation, description: 'Taken from the till or the bank.' })
  @IsEnum(MoneyLocation)
  source!: MoneyLocation;

  @ApiProperty({ description: 'When it should be paid back by.' })
  @Type(() => Date)
  @IsDate()
  dueDate!: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RepayLoanDto {
  @ApiProperty({ example: 50000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @ApiProperty({ enum: MoneyLocation, description: 'Where the money was paid back to.' })
  @IsEnum(MoneyLocation)
  destination!: MoneyLocation;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class LoanQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: LoanStatus })
  @IsOptional()
  @IsEnum(LoanStatus)
  status?: LoanStatus;

  @ApiPropertyOptional({ description: 'Filter to one borrower.' })
  @IsOptional()
  @IsUUID()
  userId?: string;
}

export class BankStatementQueryDto extends PaginationQueryDto {}
