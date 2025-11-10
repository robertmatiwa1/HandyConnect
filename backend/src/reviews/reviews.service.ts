import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Review } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { JobsService } from '../jobs/jobs.service';
import { JobStatus } from '../jobs/job-status.enum';
import { CreateReviewDto } from './dto/create-review.dto';

interface ReviewResponse {
  id: string;
  jobId: string;
  providerId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

interface ProviderRatingSummary {
  providerId: string;
  rating: number | null;
  ratingCount: number;
}

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService, private readonly jobsService: JobsService) {}

  async createReview(customerId: string, dto: CreateReviewDto) {
    if (!dto.jobId) {
      throw new BadRequestException('Job ID is required');
    }

    const rating = Number(dto.rating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }

    const job = this.jobsService.getJobById(dto.jobId);
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (job.customerId !== customerId) {
      throw new UnauthorizedException('You can only review your own jobs');
    }

    if (job.status !== JobStatus.COMPLETED) {
      throw new BadRequestException('Job must be completed before leaving a review');
    }

    const existingReview = await this.prisma.review.findUnique({ where: { jobId: dto.jobId } });
    if (existingReview) {
      throw new BadRequestException('This job has already been reviewed');
    }

    const review = await this.prisma.review.create({
      data: {
        jobId: dto.jobId,
        providerId: job.providerProfileId,
        customerId,
        rating: Math.round(rating),
        comment: dto.comment?.trim() || null,
      },
    });

    const ratingSummary = await this.computeProviderRating(job.providerProfileId);

    return {
      message: 'Review submitted',
      review: this.toResponse(review),
      providerRating: ratingSummary,
    };
  }

  async getReviewsForProvider(providerId: string) {
    const reviews = await this.prisma.review.findMany({
      where: { providerId },
      orderBy: { createdAt: 'desc' },
    });

    return reviews.map((review) => this.toResponse(review));
  }

  private toResponse(review: Review): ReviewResponse {
    return {
      id: review.id,
      jobId: review.jobId,
      providerId: review.providerId,
      rating: review.rating,
      comment: review.comment ?? null,
      createdAt: review.createdAt.toISOString(),
    };
  }

  private async computeProviderRating(providerId: string): Promise<ProviderRatingSummary> {
    const aggregate = await this.prisma.review.aggregate({
      where: { providerId },
      _avg: { rating: true },
      _count: { rating: true },
    });

    const average = aggregate._avg.rating ?? null;

    return {
      providerId,
      rating: average !== null ? Number(average.toFixed(1)) : null,
      ratingCount: aggregate._count.rating,
    };
  }
}
