import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { PaymentStatus, PaymentsService } from '../payments/payments.service';
import { UserRole } from '../users/user-role.enum';
import { JobStatus } from './job-status.enum';
import { CreateJobDto } from './dto/create-job.dto';
import { JobResponseDto } from './dto/job-response.dto';
import { UpdateJobStatusDto } from './dto/update-job-status.dto';
import { JobRecord } from './job.interface';

@Injectable()
export class JobsService {
  private readonly jobs: JobRecord[] = [];

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

    const job: JobRecord = {
      id: `job_${Math.random().toString(36).substring(2, 10)}`,
      customerId,
      providerProfileId: providerProfile.id,
      providerUserId: providerProfile.userId,
      providerName: providerProfile.user.name,
      title: `${providerProfile.skill} service`,
      notes: notes ? notes : null,
      scheduledAt: scheduledAt.toISOString(),
      suburb: providerProfile.suburb,
      priceCents: providerProfile.hourlyRate ?? 7500,
      status: JobStatus.PENDING,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    this.jobs.unshift(job);
    return this.toResponse(job);
  }

  listJobsForUser(user: { id: string; role: UserRole }): JobResponseDto[] {
    if (user.role === UserRole.CUSTOMER) {
      return this.jobs.filter((job) => job.customerId === user.id).map((job) => this.toResponse(job));
    }

    if (user.role === UserRole.PROVIDER) {
      return this.jobs.filter((job) => job.providerUserId === user.id).map((job) => this.toResponse(job));
    }

    return [];
  }

  updateJobStatus(jobId: string, providerUserId: string, dto: UpdateJobStatusDto): JobResponseDto {
    const job = this.jobs.find((item) => item.id === jobId);

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (job.providerUserId !== providerUserId) {
      throw new UnauthorizedException('You are not assigned to this job');
    }

    if (!Object.values(JobStatus).includes(dto.status)) {
      throw new BadRequestException('Invalid status');
    }

    job.status = dto.status;
    job.updatedAt = new Date().toISOString();

    if (dto.status === JobStatus.ACCEPTED) {
      console.log(`[Push] Job ${job.id} accepted for customer ${job.customerId}`);
    }

    if (dto.status === JobStatus.COMPLETED) {
      console.log(`[Push] Job ${job.id} completed for customer ${job.customerId}`);

      const payment = this.paymentsService.getPayment(job.id);

      if (payment && payment.status === PaymentStatus.ESCROW) {
        try {
          this.paymentsService.releaseEscrow(job.id);
          console.log(`[Payments] Escrow released for job ${job.id}`);
        } catch (error) {
          console.warn(`[Payments] Unable to release escrow for job ${job.id}: ${(error as Error).message}`);
        }
      }
    }

    return this.toResponse(job);
  }

  private getDefaultScheduledAt(now: Date) {
    const scheduled = new Date(now);
    scheduled.setDate(scheduled.getDate() + 2);
    scheduled.setHours(10, 0, 0, 0);
    return scheduled;
  }

  private toResponse(job: JobRecord): JobResponseDto {
    return {
      id: job.id,
      title: job.title,
      providerName: job.providerName,
      status: job.status,
      scheduledAt: job.scheduledAt,
      suburb: job.suburb,
      priceCents: job.priceCents,
      notes: job.notes,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }
}
