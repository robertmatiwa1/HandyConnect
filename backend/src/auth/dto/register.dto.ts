import { IsEmail, IsEnum, IsNotEmpty, MinLength } from 'class-validator';

import { UserRole } from '../../users/user-role.enum';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  @MinLength(8)
  password!: string;

  @IsNotEmpty()
  name!: string;

  @IsEnum(UserRole)
  role!: UserRole;
}
