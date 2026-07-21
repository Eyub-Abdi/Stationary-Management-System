import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateExpenseCategoryDto {
  @ApiProperty({ example: 'Water Bill' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;

  @ApiPropertyOptional({
    example: 'water_drop',
    description: 'Material Symbols icon name shown beside the category.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  icon?: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Whether staff (not just admins) may record and see this category.',
  })
  @IsOptional()
  @IsBoolean()
  staffAllowed?: boolean;

  @ApiPropertyOptional({ default: 100, description: 'Lower sorts first in pickers.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateExpenseCategoryDto extends PartialType(CreateExpenseCategoryDto) {
  @ApiPropertyOptional({
    description: 'Archive (false) to hide from pickers while keeping history.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
