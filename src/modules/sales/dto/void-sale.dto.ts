import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class VoidSaleDto {
  @ApiProperty({ example: 'Customer returned all items / wrong items billed' })
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(255)
  reason!: string;
}
