import { Module } from '@nestjs/common';

import { RolesGuard } from '../common/guards/roles.guard';
import { PaymentsModule } from '../payments/payments.module';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [PaymentsModule],
  controllers: [JobsController],
  providers: [JobsService, RolesGuard],
  exports: [JobsService],
})
export class JobsModule {}
