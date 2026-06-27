import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod, SaleItemType } from '@prisma/client';
import { Type } from 'class-transformer';
import { SellUnit } from '../../../common/enums/sell-unit.enum';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class SaleItemInputDto {
  @ApiProperty({ enum: SaleItemType })
  @IsEnum(SaleItemType)
  itemType!: SaleItemType;

  @ApiPropertyOptional({ description: 'Required when itemType = PRODUCT — the product variant being sold.' })
  @IsOptional()
  @IsUUID()
  variantId?: string;

  @ApiPropertyOptional({ description: 'Required when itemType = SERVICE — the priced option (e.g. A4/A3).' })
  @IsOptional()
  @IsUUID()
  serviceVariantId?: string;

  @ApiPropertyOptional({
    enum: SellUnit,
    default: SellUnit.BASE,
    description:
      'For products: BASE sells single pieces, BULK sells whole packaging units (box/carton). Ignored for services.',
  })
  @IsOptional()
  @IsEnum(SellUnit)
  sellUnit?: SellUnit;

  @ApiProperty({ example: 2, description: 'Quantity in the chosen unit (pieces, boxes) or job count (services).' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({
    example: 10,
    description: 'Pages, for PER_PAGE services. Line = unitPrice * pages * quantity.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pages?: number;

  @ApiPropertyOptional({ example: 0, description: 'Per-line discount amount (2 dp).' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discount?: number;
}

export class CreateSaleDto {
  @ApiProperty({ type: [SaleItemInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleItemInputDto)
  items!: SaleItemInputDto[];

  @ApiPropertyOptional({
    enum: PaymentMethod,
    default: PaymentMethod.CASH,
    description: 'CASH settles in full from the till. CREDIT requires a customer and leaves a balance owing.',
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({
    description: 'Required when paymentMethod = CREDIT — the debtor who owes the balance.',
  })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiProperty({
    example: 25000,
    description:
      'Cash physically received. For CASH sales must cover the total (change returned). For CREDIT this is the down payment (may be 0).',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cashReceived!: number;

  @ApiPropertyOptional({ description: 'Optional order-level discount (2 dp).' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  orderDiscount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
