import { Injectable } from '@nestjs/common';
import { DisputeStatus, Prisma, RefundStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

interface DisputeResponse {
  id: string;
  paymentId: string;
  jobId: string;
  amountCents: number;
  status: DisputeStatus;
  reason: string;
  submittedAt: string;
  resolvedAt: string | null;
  customerName: string;
  providerName: string;
}

interface RefundResponse {
  id: string;
  jobId: string;
  amountCents: number;
  status: RefundStatus;
  reason: string | null;
  requestedAt: string;
  processedAt: string | null;
  customerName: string;
  providerName: string;
}

interface ProviderVerificationResponse {
  id: string;
  name: string;
  skill: string;
  suburb: string;
  hourlyRate: number | null;
  verified: boolean;
  rating: number | null;
  ratingCount: number;
  submittedAt: string;
}

@Injectable()
export class OpsService {
  private readonly disputeInclude: Prisma.DisputeInclude = {
    payment: {
      include: {
        job: {
          include: {
            provider: { include: { user: true } },
            customer: true,
          },
        },
      },
    },
  };

  private readonly refundInclude: Prisma.RefundInclude = {
    job: {
      include: {
        provider: { include: { user: true } },
        customer: true,
      },
    },
  };

  constructor(private readonly prisma: PrismaService) {}

  async listDisputes(): Promise<DisputeResponse[]> {
    const disputes = await this.prisma.dispute.findMany({
      include: this.disputeInclude,
      orderBy: { submittedAt: 'desc' },
    });

    return disputes.map((dispute) => ({
      id: dispute.id,
      paymentId: dispute.paymentId,
      jobId: dispute.payment.jobId,
      amountCents: dispute.amountCents,
      status: dispute.status,
      reason: dispute.reason,
      submittedAt: dispute.submittedAt.toISOString(),
      resolvedAt: dispute.resolvedAt ? dispute.resolvedAt.toISOString() : null,
      customerName: dispute.payment.job.customer.name,
      providerName: dispute.payment.job.provider.user.name,
    }));
  }

  async listRefunds(): Promise<RefundResponse[]> {
    const refunds = await this.prisma.refund.findMany({
      include: this.refundInclude,
      orderBy: { requestedAt: 'desc' },
    });

    return refunds.map((refund) => ({
      id: refund.id,
      jobId: refund.jobId,
      amountCents: refund.amountCents,
      status: refund.status,
      reason: refund.reason ?? null,
      requestedAt: refund.requestedAt.toISOString(),
      processedAt: refund.processedAt ? refund.processedAt.toISOString() : null,
      customerName: refund.job.customer.name,
      providerName: refund.job.provider.user.name,
    }));
  }

  async listProviderVerifications(): Promise<ProviderVerificationResponse[]> {
    const profiles = await this.prisma.providerProfile.findMany({
      include: { user: true, reviews: true },
      orderBy: { createdAt: 'desc' },
    });

    return profiles.map((profile) => {
      const ratingCount = profile.reviews.length;
      const rating = ratingCount
        ? Number(
            (
              profile.reviews.reduce((total, review) => total + review.rating, 0) /
              ratingCount
            ).toFixed(1),
          )
        : null;

      return {
        id: profile.id,
        name: profile.user.name,
        skill: profile.skill,
        suburb: profile.suburb,
        hourlyRate: profile.hourlyRate ?? null,
        verified: profile.verified,
        rating,
        ratingCount,
        submittedAt: profile.createdAt.toISOString(),
      };
    });
  }

}
