import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CreatePaymentDto } from './dto/create-payment.dto';

const prisma = new PrismaClient();

@Injectable()
export class PaymentsService {
  async create(dto: CreatePaymentDto) {
    const job = await prisma.job.findUnique({ where: { id: dto.jobId } });
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    return prisma.payment.upsert({
      where: { jobId: dto.jobId },
      update: {
        amountCents: dto.amountCents,
        commissionCents: dto.commissionCents,
        providerPayoutCents: dto.providerPayoutCents,
        method: dto.method,
      },
      create: {
        job: { connect: { id: dto.jobId } },
        amountCents: dto.amountCents,
        commissionCents: dto.commissionCents,
        providerPayoutCents: dto.providerPayoutCents,
        method: dto.method,
      },
      include: { job: true },
    });
  }
}
