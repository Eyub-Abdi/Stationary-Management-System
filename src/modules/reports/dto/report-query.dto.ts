import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional } from 'class-validator';

export enum ReportGranularity {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
}

export class ReportRangeDto {
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

export class SalesReportQueryDto extends ReportRangeDto {
  @ApiPropertyOptional({ enum: ReportGranularity, default: ReportGranularity.DAILY })
  @IsOptional()
  @IsEnum(ReportGranularity)
  granularity: ReportGranularity = ReportGranularity.DAILY;
}
