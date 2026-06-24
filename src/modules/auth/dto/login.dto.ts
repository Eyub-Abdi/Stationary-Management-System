import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@kjstationery.co.tz' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'ChangeMe!Admin123' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
