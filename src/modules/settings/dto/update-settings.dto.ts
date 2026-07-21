import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

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
    example: '22:00',
    description: 'Local time of day (HH:mm, 24-hour) the daily backup should run.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'backupTime must be in HH:mm 24-hour format, e.g. 22:00',
  })
  backupTime?: string;

  @ApiPropertyOptional({
    description: 'Custom backup folder. Leave blank for the default (drive D on Windows).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(260)
  backupDir?: string;

  @ApiPropertyOptional({
    example: 3,
    description:
      'How many backup files to keep. Each new backup replaces the oldest once this many exist.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  backupKeep?: number;
}
