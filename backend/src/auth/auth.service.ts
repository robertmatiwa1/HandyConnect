import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';

import { UsersService } from '../users/users.service';
import { UserRole } from '../users/user-role.enum';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto) {
    const existing = await this.usersService.findByEmail(registerDto.email);
    if (existing) {
      throw new BadRequestException('Email already registered');
    }

    const password = await argon2.hash(registerDto.password);
    const emailVerificationCode = randomUUID();

    const user = await this.usersService.create({
      email: registerDto.email,
      name: registerDto.name,
      password,
      role: registerDto.role,
      emailVerificationCode,
    });

    const token = await this.generateToken(user.id, user.role as UserRole);

    return {
      user,
      accessToken: token,
      emailVerificationCode,
    };
  }

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByEmail(loginDto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await argon2.verify(user.password, loginDto.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = await this.generateToken(user.id, user.role as UserRole);
    const safeUser = this.usersService.excludePassword(user);

    return {
      user: safeUser,
      accessToken: token,
    };
  }

  async getProfile(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }

    return this.usersService.excludePassword(user);
  }

  async verifyEmail(code: string) {
    const user = await this.usersService.markEmailAsVerified(code);
    return {
      message: 'Email verified successfully',
      user,
    };
  }

  private async generateToken(userId: string, role: UserRole) {
    return this.jwtService.signAsync({
      sub: userId,
      role,
    });
  }
}
