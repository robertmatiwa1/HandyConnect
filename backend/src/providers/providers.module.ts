import { Module } from '@nestjs/common';

import { RolesGuard } from '../common/guards/roles.guard';
import { ProvidersController } from './providers.controller';

@Module({
  controllers: [ProvidersController],
  providers: [RolesGuard],
})
export class ProvidersModule {}
