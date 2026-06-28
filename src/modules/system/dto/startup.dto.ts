import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetStartupDto {
  @ApiProperty({ description: 'Enable or disable launching the app on Windows startup.' })
  @IsBoolean()
  enabled!: boolean;
}
