import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';

/**
 * SKU is immutable after creation (it is snapshotted on historical documents
 * and used as a stable business identifier). Stock is never set directly here —
 * it changes only through purchases, sales, adjustments and returns.
 */
export class UpdateProductDto extends PartialType(
  OmitType(CreateProductDto, ['sku'] as const),
) {}
