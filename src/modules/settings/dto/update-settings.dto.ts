import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSettingsDto {
  @ApiPropertyOptional({ example: 'KJ Stationery', description: 'Shop / business name shown across the app.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  businessName?: string;

  @ApiPropertyOptional({ example: 'Main Branch' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  branchName?: string;
}
