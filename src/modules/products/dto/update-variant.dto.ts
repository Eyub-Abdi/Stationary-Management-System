import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateVariantDto } from './create-variant.dto';

/** SKU is immutable after creation (snapshotted on historical documents). */
export class UpdateVariantDto extends PartialType(
  OmitType(CreateVariantDto, ['sku'] as const),
) {}
