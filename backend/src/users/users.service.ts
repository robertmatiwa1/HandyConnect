import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async updateUserProfile(userId: string, data: UpdateUserDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data,
    });
  }
}
