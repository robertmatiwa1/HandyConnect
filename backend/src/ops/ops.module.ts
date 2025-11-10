import { Module } from '@nestjs/common';

import { RolesGuard } from '../common/guards/roles.guard';
import { OpsController } from './ops.controller';
import { OpsService } from './ops.service';

@Module({
  controllers: [OpsController],
  providers: [OpsService, RolesGuard],
  exports: [OpsService],
})
export class OpsModule {}
