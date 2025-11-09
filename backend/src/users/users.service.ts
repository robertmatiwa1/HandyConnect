import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from './user-role.enum';

export interface CreateUserInput {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  emailVerificationCode: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateUserInput) {
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        password: input.password,
        name: input.name,
        role: input.role,
        emailVerificationCode: input.emailVerificationCode,
      },
    });

    return this.excludePassword(user);
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async markEmailAsVerified(code: string) {
    const user = await this.prisma.user.findUnique({
      where: { emailVerificationCode: code },
    });

    if (!user) {
      throw new NotFoundException('Verification code not found');
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerificationCode: null },
    });

    return this.excludePassword(updated);
  }

  excludePassword<T extends { password?: string }>(user: T) {
    if (!user) {
      return user;
    }

    const { password, ...safeUser } = user;
    return safeUser;
  }
}
