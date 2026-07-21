import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class RestoreLocalDto {
  @ApiProperty({
    example: 'kj_20260721080606.dump',
    description: 'Filename of a dump inside the configured backup folder.',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[\w.-]+\.dump$/, { message: 'Invalid backup filename.' })
  filename!: string;

  @ApiPropertyOptional({
    description:
      'Required to restore a backup taken before the current schema — it rolls the database back.',
  })
  @IsOptional()
  @IsBoolean()
  acknowledgeOlder?: boolean;
}
