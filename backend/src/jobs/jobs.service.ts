import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PaymentStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { sendNotification } from '../notifications/notification.service';
import { UserRole } from '../users/user-role.enum';
import { JobStatus } from './job-status.enum';
import { CreateJobDto } from './dto/create-job.dto';
import { JobResponseDto } from './dto/job-response.dto';
import { UpdateJobStatusDto } from './dto/update-job-status.dto';

type JobWithRelations = Prisma.JobGetPayload<{
  include: { provider: { include: { user: true } }; review: true };
}>;

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
  ) {}

  async createJob(customerId: string, dto: CreateJobDto): Promise<JobResponseDto> {
    if (!dto.providerId) {
      throw new BadRequestException('Provider is required');
    }

    const providerProfile = await this.prisma.providerProfile.findUnique({
      where: { id: dto.providerId },
      include: { user: true },
    });

    if (!providerProfile) {
      throw new NotFoundException('Provider not found');
    }

    const now = new Date();
    const scheduledAtCandidate = dto.scheduledAt ? new Date(dto.scheduledAt) : this.getDefaultScheduledAt(now);
    const scheduledAt = Number.isNaN(scheduledAtCandidate.getTime())
      ? this.getDefaultScheduledAt(now)
      : scheduledAtCandidate;

    const notes = dto.notes?.trim();

    const job = await this.prisma.job.create({
      data: {
        customerId,
        providerProfileId: providerProfile.id,
        title: `${providerProfile.skill} service`,
        notes: notes ?? null,
        scheduledAt,
        suburb: providerProfile.suburb,
        priceCents: providerProfile.hourlyRate ?? 7500,
        status: JobStatus.PENDING,
      },
      include: this.defaultInclude,
    });

    sendNotification(
      providerProfile.userId,
      'JOB_REQUESTED',
      `New job request ${job.id} scheduled for ${scheduledAt.toISOString()}.`,
    );

    return await this.toResponse(job);
  }

  async listJobsForUser(user: { id: string; role: UserRole }): Promise<JobResponseDto[]> {
    if (user.role === UserRole.CUSTOMER) {
      const jobs = await this.prisma.job.findMany({
        where: { customerId: user.id },
        include: this.defaultInclude,
        orderBy: { createdAt: 'desc' },
      });
      return Promise.all(jobs.map((job) => this.toResponse(job)));
    }

    if (user.role === UserRole.PROVIDER) {
      const jobs = await this.prisma.job.findMany({
        where: { provider: { userId: user.id } },
        include: this.defaultInclude,
        orderBy: { createdAt: 'desc' },
      });
      return Promise.all(jobs.map((job) => this.toResponse(job)));
    }

    return [];
  }

  async updateJobStatus(jobId: string, providerUserId: string, dto: UpdateJobStatusDto): Promise<JobResponseDto> {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, provider: { userId: providerUserId } },
      include: this.defaultInclude,
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (!Object.values(JobStatus).includes(dto.status)) {
      throw new BadRequestException('Invalid status');
    }

    const updated = await this.prisma.job.update({
      where: { id: jobId },
      data: { status: dto.status },
      include: this.defaultInclude,
    });

    if (dto.status === JobStatus.ACCEPTED) {
      console.log(
        `[Push] Job ${updated.id} accepted by provider ${updated.provider.userId} for customer ${updated.customerId}`,
      );

      sendNotification(
        updated.customerId,
        'JOB_ACCEPTED',
        `Job ${updated.id} has been accepted by ${updated.provider.user.name}.`,
      );
    }

    if (dto.status === JobStatus.COMPLETED) {
      console.log(`[Push] Job ${updated.id} completed for customer ${updated.customerId}`);

      const payment = await this.paymentsService.getPayment(updated.id);

      if (payment && payment.status === PaymentStatus.ESCROW) {
        try {
          await this.paymentsService.releaseEscrow(updated.id);
          console.log(`[Payments] Escrow released for job ${updated.id}`);
          sendNotification(
            updated.provider.userId,
            'PAYOUT_RELEASED',
            `Payout released for job ${updated.id}.`,
          );
        } catch (error) {
          console.warn(
            `[Payments] Unable to release escrow for job ${updated.id}: ${(error as Error).message}`,
          );
        }
      }
    }

    return await this.toResponse(updated);
  }

  async getJobById(jobId: string) {
    return this.prisma.job.findUnique({ where: { id: jobId }, include: this.defaultInclude });
  }

  private getDefaultScheduledAt(now: Date) {
    const scheduled = new Date(now);
    scheduled.setDate(scheduled.getDate() + 2);
    scheduled.setHours(10, 0, 0, 0);
    return scheduled;
  }

  private readonly defaultInclude: Prisma.JobInclude = {
    provider: { include: { user: true } },
    review: true,
  };

  private async toResponse(job: JobWithRelations): Promise<JobResponseDto> {
    return {
      id: job.id,
      providerId: job.providerProfileId,
      title: job.title,
      providerName: job.provider.user.name,
      status: job.status,
      scheduledAt: job.scheduledAt.toISOString(),
      suburb: job.suburb,
      priceCents: job.priceCents,
      notes: job.notes ?? null,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      hasReview: Boolean(job.review),
    };
  }
}
