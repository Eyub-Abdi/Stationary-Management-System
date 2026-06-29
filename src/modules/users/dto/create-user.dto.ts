import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PERMISSION_KEYS, PermissionKey } from '../../../common/permissions';

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

  @ApiPropertyOptional({
    isArray: true,
    enum: PERMISSION_KEYS,
    description: 'STAFF grants (ignored for admins, who have everything).',
  })
  @IsOptional()
  @IsArray()
  @IsIn(PERMISSION_KEYS as readonly string[], { each: true })
  permissions?: PermissionKey[];
}
