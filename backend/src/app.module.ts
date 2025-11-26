import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProvidersModule } from './providers/providers.module';
import { JobsModule } from './jobs/jobs.module';
import { PaymentsModule } from './payments/payments.module';
import { ReviewsModule } from './reviews/reviews.module';
import { HealthController} from './health.controller';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    ProvidersModule,
    JobsModule,
    PaymentsModule,
    ReviewsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
