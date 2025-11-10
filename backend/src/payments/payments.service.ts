import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { JobStatus } from '../jobs/job-status.enum';

const PSP_BASE_URL = process.env.PSP_BASE_URL ?? 'https://checkout.handypayments.dev/session';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async createCheckout(jobId: string, amountCents: number) {
    if (!jobId) {
      throw new BadRequestException('jobId is required for checkout creation.');
    }

    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new BadRequestException('amountCents must be a positive number.');
    }

    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { payment: true },
    });

    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    if (job.status === JobStatus.CANCELLED) {
      throw new BadRequestException('Cannot create a checkout for a cancelled job.');
    }

    const commissionCents = Math.round(amountCents * 0.1);
    const providerPayoutCents = Math.max(amountCents - commissionCents, 0);
    const checkoutUrl = `${PSP_BASE_URL}?job=${jobId}`;

    const payment = await this.prisma.payment.upsert({
      where: { jobId },
      update: {
        amountCents,
        commissionCents,
        providerPayoutCents,
        checkoutUrl,
        status: PaymentStatus.PENDING,
      },
      create: {
        jobId,
        amountCents,
        commissionCents,
        providerPayoutCents,
        checkoutUrl,
        status: PaymentStatus.PENDING,
      },
    });

    return { checkoutUrl: payment.checkoutUrl, payment };
  }

  async handleWebhook(jobId: string, status: PaymentStatus) {
    switch (status) {
      case PaymentStatus.ESCROW:
        return this.moveToEscrow(jobId);
      case PaymentStatus.PAID:
        return this.releaseEscrow(jobId);
      case PaymentStatus.PENDING:
        throw new BadRequestException('Webhook cannot revert a payment to pending.');
      default:
        throw new BadRequestException(`Unsupported payment status: ${status}`);
    }
  }

  async moveToEscrow(jobId: string) {
    const payment = await this.getPaymentOrThrow(jobId);

    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException(`Payment for job ${jobId} cannot move to escrow from ${payment.status}`);
    }

    const updated = await this.prisma.payment.update({
      where: { jobId },
      data: { status: PaymentStatus.ESCROW },
    });

    await this.prisma.job.update({
      where: { id: jobId },
      data: { status: JobStatus.IN_PROGRESS },
    });

    return updated;
  }

  async releaseEscrow(jobId: string) {
    const payment = await this.getPaymentOrThrow(jobId);

    if (payment.status !== PaymentStatus.ESCROW) {
      throw new BadRequestException(`Payment for job ${jobId} is not ready for release.`);
    }

    const updated = await this.prisma.payment.update({
      where: { jobId },
      data: { status: PaymentStatus.PAID },
    });

    await this.prisma.job.update({
      where: { id: jobId },
      data: { status: JobStatus.COMPLETED },
    });

    return updated;
  }

  async getPayment(jobId: string) {
    return this.prisma.payment.findUnique({ where: { jobId } });
  }

  private async getPaymentOrThrow(jobId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { jobId } });
    if (!payment) {
      throw new NotFoundException(`Payment for job ${jobId} not found`);
    }
    return payment;
  }
}
