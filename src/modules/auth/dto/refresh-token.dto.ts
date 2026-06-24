import { ApiProperty } from '@nestjs/swagger';
import { IsJWT } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: 'A valid, unexpired refresh token' })
  @IsJWT()
  refreshToken!: string;
}
