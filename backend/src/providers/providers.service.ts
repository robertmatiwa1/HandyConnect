import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderProfileDto } from './dto/provider-profile.dto';

@Injectable()
export class ProvidersService {
  constructor(private prisma: PrismaService) {}

  async upsertProfile(userId: string, data: ProviderProfileDto) {
    return this.prisma.providerProfile.upsert({
      where: { userId },
      update: data,
      create: {
        userId,
        ...data,
      },
    });
  }
}
