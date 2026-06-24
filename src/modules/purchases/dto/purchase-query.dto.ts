import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

/**
 * Concrete query class so NestJS transforms/validates pagination params.
 * (An intersection type like `PaginationQueryDto & {…}` has no runtime
 * metatype, so page/limit would arrive as un-coerced strings and break Prisma.)
 */
export class PurchaseQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by supplier' })
  @IsOptional()
  @IsUUID()
  supplierId?: string;
}
