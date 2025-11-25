import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { QueryProvidersDto } from './dto/query-providers.dto';

const prisma = new PrismaClient();

@Injectable()
export class ProvidersService {
  async findAll(query: QueryProvidersDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where = {
      suburb: query.suburb ? { contains: query.suburb, mode: 'insensitive' as const } : undefined,
      skillCategory: query.skillCategory
        ? { contains: query.skillCategory, mode: 'insensitive' as const }
        : undefined,
    };

    const [items, total] = await prisma.$transaction([
      prisma.providerProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: { rating: 'desc' },
        include: {
          user: { select: { id: true, name: true } },
        },
      }),
      prisma.providerProfile.count({ where }),
    ]);

    return {
      data: items,
      meta: {
        page,
        limit,
        total,
      },
    };
  }

  findOne(id: string) {
    return prisma.providerProfile.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
      },
    });
  }
}
