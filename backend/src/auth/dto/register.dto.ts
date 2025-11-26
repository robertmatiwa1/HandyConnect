import { 
  IsEmail, 
  IsOptional, 
  IsString, 
  MinLength, 
  IsEnum 
} from 'class-validator';
import { Role } from '@prisma/client';

export class RegisterDto {
  @IsString()
  name!: string;

  @IsEmail()
  email!: string;

  @MinLength(6)
  password!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}