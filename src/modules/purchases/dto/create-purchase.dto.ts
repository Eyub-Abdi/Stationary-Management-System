import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import { SellUnit } from '../../../common/enums/sell-unit.enum';
import {
  ArrayMinSize,
  IsArray,
  IsDate,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class PurchaseItemDto {
  @ApiProperty({ description: 'The product variant being purchased.' })
  @IsUUID()
  variantId!: string;

  @ApiPropertyOptional({
    enum: SellUnit,
    default: SellUnit.BASE,
    description: 'BASE buys individual pieces; BULK buys whole packaging units (box/carton).',
  })
  @IsOptional()
  @IsEnum(SellUnit)
  sellUnit?: SellUnit;

  @ApiProperty({ example: 100, description: 'Quantity in the chosen unit (pieces or packs).' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({
    example: 12,
    description: 'Pieces in each pack for this delivery. Required when sellUnit is BULK (min 2).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  unitSize?: number;

  @ApiPropertyOptional({
    example: 'Box',
    description: 'Pack name for this delivery (e.g. Box, Roll, Ream). Used when sellUnit is BULK.',
  })
  @IsOptional()
  @IsString()
  unitLabel?: string;

  @ApiProperty({ example: 500, description: 'Cost per chosen unit at purchase (2 dp).' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost!: number;

  @ApiPropertyOptional({
    example: 700,
    description:
      'New selling price per base unit / piece (2 dp). When provided, updates the variant price tag. Required on a variant that has no price yet.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sellingPrice?: number;

  @ApiPropertyOptional({
    example: 500,
    description: 'New wholesale price per piece (2 dp). Updates the variant wholesale tag.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  wholesalePrice?: number;
}

export class CreatePurchaseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  purchaseDate!: Date;

  @ApiPropertyOptional({
    enum: PaymentMethod,
    default: PaymentMethod.CASH,
    description: 'CASH pays in full now. CREDIT requires a supplier and leaves a balance payable.',
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({
    example: 0,
    description: 'Amount paid now. For CREDIT this is the down payment (defaults to 0).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amountPaid?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [PurchaseItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  @IsNotEmpty()
  items!: PurchaseItemDto[];
}
