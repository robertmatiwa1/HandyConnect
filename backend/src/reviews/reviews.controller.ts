import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/user-role.enum';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewsService } from './reviews.service';

type RequestWithUser = Request & { user: { id: string } };

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER)
  createReview(@Req() req: RequestWithUser, @Body() dto: CreateReviewDto) {
    return this.reviewsService.createReview(req.user.id, dto);
  }

  @Get('provider/:providerId')
  getForProvider(@Param('providerId') providerId: string) {
    return this.reviewsService.getReviewsForProvider(providerId);
  }
}
