import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { JobStatus, PrismaClient } from '@prisma/client';
import { CreateReviewDto } from './dto/create-review.dto';

const prisma = new PrismaClient();

@Injectable()
export class ReviewsService {
  async create(dto: CreateReviewDto) {
    const job = await prisma.job.findUnique({
      where: { id: dto.jobId },
      include: { provider: true },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (job.status !== JobStatus.COMPLETED) {
      throw new BadRequestException('Job must be completed before review');
    }

    if (!job.providerId) {
      throw new BadRequestException('Job does not have an assigned provider');
    }

    return prisma.$transaction(async (tx) => {
      const existingReview = await tx.review.findUnique({ where: { jobId: dto.jobId } });

      const review = existingReview
        ? await tx.review.update({
            where: { jobId: dto.jobId },
            data: { rating: dto.rating, comment: dto.comment },
          })
        : await tx.review.create({
            data: {
              job: { connect: { id: dto.jobId } },
              rating: dto.rating,
              comment: dto.comment,
            },
          });

      const providerProfile = await tx.providerProfile.findUnique({
        where: { userId: job.providerId },
      });

      if (providerProfile) {
        const currentTotal = providerProfile.rating * providerProfile.ratingsCount;
        const totalRating = existingReview
          ? currentTotal - existingReview.rating + dto.rating
          : currentTotal + dto.rating;
        const newCount = existingReview
          ? providerProfile.ratingsCount
          : providerProfile.ratingsCount + 1;

        await tx.providerProfile.update({
          where: { id: providerProfile.id },
          data: {
            ratingsCount: newCount,
            rating: newCount === 0 ? 0 : totalRating / newCount,
          },
        });
      }

      return review;
    });
  }
}
