import { Module } from '@nestjs/common';

import { AuthModule } from './auth/auth.module';
import { JobsModule } from './jobs/jobs.module';
import { PaymentsModule } from './payments/payments.module';
import { ProvidersModule } from './providers/providers.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, AuthModule, ProvidersModule, JobsModule, PaymentsModule],
})
export class AppModule {}
