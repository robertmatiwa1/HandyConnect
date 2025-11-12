import { Module } from '@nestjs/common';

import { RolesGuard } from '../common/guards/roles.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { OpsController } from './ops.controller';
import { OpsService } from './ops.service';

@Module({
  imports: [PrismaModule],
  controllers: [OpsController],
  providers: [OpsService, RolesGuard],
  exports: [OpsService],
})
export class OpsModule {}
