import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

@Injectable()
export class UsersService {
  findAll() {
    return prisma.user.findMany({
      select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true },
    });
  }

  findOne(id: string) {
    return prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true },
    });
  }
}
