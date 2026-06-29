import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

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

  @ApiPropertyOptional({ description: 'Enable automatic daily database backups to local disk.' })
  @IsOptional()
  @IsBoolean()
  autoBackupEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Custom backup folder. Leave blank for the default (drive D on Windows).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(260)
  backupDir?: string;
}
