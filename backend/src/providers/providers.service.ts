import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { UpdateProviderProfileDto } from './dto/update-provider-profile.dto';

interface ProviderFilters {
  skill?: string;
  suburb?: string;
}

type ProviderWithRelations = Prisma.ProviderProfileGetPayload<{
  include: { user: true; reviews: true };
}>;

@Injectable()
export class ProvidersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters: ProviderFilters = {}) {
    const profiles = await this.prisma.providerProfile.findMany({
      where: {
        skill: filters.skill
          ? { contains: filters.skill, mode: 'insensitive' }
          : undefined,
        suburb: filters.suburb
          ? { contains: filters.suburb, mode: 'insensitive' }
          : undefined,
      },
      include: { user: true, reviews: true },
      orderBy: { createdAt: 'desc' },
    });

    return profiles.map((profile) => this.toResponse(profile));
  }

  async getById(id: string) {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { id },
      include: { user: true, reviews: true },
    });

    if (!profile) {
      throw new NotFoundException('Provider not found');
    }

    return this.toResponse(profile);
  }

  async updateForUser(userId: string, dto: UpdateProviderProfileDto) {
    const existing = await this.prisma.providerProfile.findUnique({
      where: { userId },
    });

    if (!existing && (!dto.skill || !dto.suburb)) {
      throw new BadRequestException('Skill and suburb are required to create a profile.');
    }

    const profile = await this.prisma.providerProfile.upsert({
      where: { userId },
      update: {
        skill: dto.skill ?? undefined,
        suburb: dto.suburb ?? undefined,
        hourlyRate: dto.hourlyRate ?? undefined,
        bio: dto.bio ?? undefined,
        experienceYears: dto.experienceYears ?? undefined,
        photoUrl: dto.photoUrl ?? undefined,
        portfolio: dto.portfolio ?? undefined,
      },
      create: {
        userId,
        skill: dto.skill!,
        suburb: dto.suburb!,
        hourlyRate: dto.hourlyRate ?? undefined,
        bio: dto.bio ?? undefined,
        experienceYears: dto.experienceYears ?? undefined,
        photoUrl: dto.photoUrl ?? undefined,
        portfolio: dto.portfolio ?? [],
      },
      include: { user: true, reviews: true },
    });

    return this.toResponse(profile);
  }

  private toResponse(profile: ProviderWithRelations) {
    const ratingCount = profile.reviews.length;
    const rating = ratingCount
      ? Number((profile.reviews.reduce((total, review) => total + review.rating, 0) / ratingCount).toFixed(1))
      : null;

    return {
      id: profile.id,
      name: profile.user.name,
      userId: profile.userId,
      skill: profile.skill,
      suburb: profile.suburb,
      hourlyRate: profile.hourlyRate ?? null,
      bio: profile.bio ?? null,
      experienceYears: profile.experienceYears ?? null,
      verified: profile.verified,
      photoUrl: profile.photoUrl ?? null,
      portfolio: profile.portfolio ?? [],
      rating,
      ratingCount,
    };
  }
}
