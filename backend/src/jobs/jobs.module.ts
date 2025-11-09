import { Module } from '@nestjs/common';

import { RolesGuard } from '../common/guards/roles.guard';
import { JobsController } from './jobs.controller';

@Module({
  controllers: [JobsController],
  providers: [RolesGuard],
})
export class JobsModule {}
