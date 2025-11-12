import { Module } from '@nestjs/common';

import { RolesGuard } from '../common/guards/roles.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentsModule } from '../payments/payments.module';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [PrismaModule, PaymentsModule],
  controllers: [JobsController],
  providers: [JobsService, RolesGuard],
  exports: [JobsService],
})
export class JobsModule {}
