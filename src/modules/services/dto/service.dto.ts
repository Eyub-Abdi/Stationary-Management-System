import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { PricingType, ServiceStatus, ServiceType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateServiceDto {
  @ApiProperty({ example: 'Printing - Black & White' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ enum: ServiceType })
  @IsEnum(ServiceType)
  type!: ServiceType;

  @ApiProperty({ enum: PricingType })
  @IsEnum(PricingType)
  pricingType!: PricingType;

  @ApiProperty({ example: 100, description: 'Price per page (PER_PAGE) or flat (FIXED).' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice!: number;

  @ApiPropertyOptional({ enum: ServiceStatus, default: ServiceStatus.ACTIVE })
  @IsOptional()
  @IsEnum(ServiceStatus)
  status?: ServiceStatus;
}

export class UpdateServiceDto extends PartialType(CreateServiceDto) {}
