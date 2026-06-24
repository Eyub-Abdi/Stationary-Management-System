import { ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

/**
 * Concrete query class so NestJS transforms/validates pagination params.
 * (An intersection type like `PaginationQueryDto & {…}` has no runtime
 * metatype, so page/limit would arrive as un-coerced strings and break Prisma.)
 */
export class UserQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
