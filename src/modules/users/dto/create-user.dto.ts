import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'jane@kjstationery.co.tz' })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({ example: 'Jane Mwangi' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName!: string;

  @ApiProperty({
    example: 'Str0ng!Passw0rd',
    description: 'Min 8 chars, with upper, lower and a number/symbol.',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*[\d\W])/, {
    message: 'Password must contain upper, lower and a number or symbol',
  })
  password!: string;

  @ApiProperty({ enum: Role, default: Role.STAFF })
  @IsEnum(Role)
  role: Role = Role.STAFF;

  @ApiPropertyOptional({ default: false, description: 'STAFF only: may create/edit products & categories.' })
  @IsOptional()
  @IsBoolean()
  canManageProducts?: boolean;

  @ApiPropertyOptional({ default: false, description: 'STAFF only: may create/edit services.' })
  @IsOptional()
  @IsBoolean()
  canManageServices?: boolean;

  @ApiPropertyOptional({ default: false, description: 'STAFF only: may record purchases & manage units.' })
  @IsOptional()
  @IsBoolean()
  canManagePurchases?: boolean;

  @ApiPropertyOptional({ default: false, description: 'STAFF only: may adjust stock (inventory).' })
  @IsOptional()
  @IsBoolean()
  canManageInventory?: boolean;
}
