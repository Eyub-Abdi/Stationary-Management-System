import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CashMovementType, CashSessionStatus, MoneyLocation } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class OpenSessionDto {
  @ApiPropertyOptional({
    example: 50000,
    description:
      'Cash in the till at open (float). Optional — when omitted the system carries over the previous shift’s counted closing cash.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  openingBalance?: number;
}

export class CloseSessionDto {
  @ApiProperty({ example: 182500, description: 'Physically counted cash at close.' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  actualAmount!: number;

  @ApiPropertyOptional({
    example: 150000,
    description:
      'Cash taken out of the drawer at close (banked or held). Counted first, so it does not affect the variance — it only reduces the float carried into the next session.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  withdrawal?: number;

  @ApiPropertyOptional({
    description:
      'Where that cash went. Defaults to HAND — money out of the till is held at the shop until someone actually walks it to the bank, which may be once a week. BANK records it on the bank ledger straight away, so pass it only on the day of the trip.',
    enum: MoneyLocation,
    default: MoneyLocation.HAND,
  })
  @IsOptional()
  @IsEnum(MoneyLocation)
  withdrawalTo?: MoneyLocation;

  @ApiPropertyOptional({ description: 'Notes, e.g. explanation of any variance.' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CashMovementDto {
  @ApiProperty({ enum: CashMovementType })
  @IsEnum(CashMovementType)
  type!: CashMovementType;

  @ApiProperty({ example: 20000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CashSessionQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: CashSessionStatus })
  @IsOptional()
  @IsEnum(CashSessionStatus)
  status?: CashSessionStatus;
}
