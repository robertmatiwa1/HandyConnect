import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobStatusDto } from './dto/update-job-status.dto';

const prisma = new PrismaClient();

@Injectable()
export class JobsService {
  create(dto: CreateJobDto) {
    return prisma.job.create({
      data: {
        customer: { connect: { id: dto.customerId } },
        provider: dto.providerId ? { connect: { id: dto.providerId } } : undefined,
        description: dto.description,
        suburb: dto.suburb,
        scheduledAt: new Date(dto.scheduledAt),
        priceCents: dto.priceCents,
      },
      include: { customer: true, provider: true },
    });
  }

  async updateStatus(id: string, dto: UpdateJobStatusDto) {
    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    return prisma.job.update({
      where: { id },
      data: { status: dto.status },
      include: { customer: true, provider: true },
    });
  }
}
