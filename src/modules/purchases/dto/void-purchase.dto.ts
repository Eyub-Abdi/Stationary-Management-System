import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class VoidPurchaseDto {
  @ApiProperty({ example: 'Entered twice by mistake' })
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(255)
  reason!: string;
}
