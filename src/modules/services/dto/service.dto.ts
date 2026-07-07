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
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** One product a service option consumes (a bill-of-materials line). */
export class ServiceComponentDto {
  @ApiProperty({ description: 'Product variant consumed (e.g. A4 paper).' })
  @IsUUID()
  variantId!: string;

  @ApiPropertyOptional({
    example: 1,
    description: 'Whole base units consumed per page (perPage) or per job. Model fractions via the product unitSize.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty?: number;

  @ApiPropertyOptional({
    default: true,
    description: 'true = consumed per page; false = flat per job (e.g. a binding comb).',
  })
  @IsOptional()
  @IsBoolean()
  perPage?: boolean;
}

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

  @ApiPropertyOptional({
    type: [ServiceComponentDto],
    description: 'Products this option consumes (its bill of materials). Empty = none (e.g. scanning).',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceComponentDto)
  components?: ServiceComponentDto[];
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
