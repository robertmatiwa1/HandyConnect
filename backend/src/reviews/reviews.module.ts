import { Module } from '@nestjs/common';

import { RolesGuard } from '../common/guards/roles.guard';
import { JobsModule } from '../jobs/jobs.module';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [JobsModule],
  controllers: [ReviewsController],
  providers: [ReviewsService, RolesGuard],
})
export class ReviewsModule {}
