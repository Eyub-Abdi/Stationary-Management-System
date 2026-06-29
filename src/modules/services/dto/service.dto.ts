import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { PricingType, ServiceStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** A priced option of a service, e.g. "A4" / "A3". */
export class CreateServiceVariantDto {
  @ApiProperty({ example: 'A4', description: 'Option label (e.g. paper size).' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  label!: string;

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

export class UpdateServiceVariantDto extends PartialType(CreateServiceVariantDto) {}

export class CreateServiceDto {
  @ApiProperty({ example: 'Printing - Black & White' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({
    example: 'print',
    description: 'Material Symbols icon name shown in the UI. Cosmetic only.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  icon?: string;

  @ApiProperty({ enum: PricingType })
  @IsEnum(PricingType)
  pricingType!: PricingType;

  @ApiPropertyOptional({ enum: ServiceStatus, default: ServiceStatus.ACTIVE })
  @IsOptional()
  @IsEnum(ServiceStatus)
  status?: ServiceStatus;

  @ApiProperty({
    type: [CreateServiceVariantDto],
    description: 'At least one option. A single-option service behaves like a plain service.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateServiceVariantDto)
  @IsNotEmpty()
  variants!: CreateServiceVariantDto[];
}

export class UpdateServiceDto extends PartialType(
  OmitType(CreateServiceDto, ['variants'] as const),
) {}
