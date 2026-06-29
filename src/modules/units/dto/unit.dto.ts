import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateUnitDto {
  @ApiProperty({ example: 'Box' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  name!: string;
}

export class UpdateUnitDto extends PartialType(CreateUnitDto) {}
