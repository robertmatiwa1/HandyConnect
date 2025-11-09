import { Module } from '@nestjs/common';

import { RolesGuard } from '../common/guards/roles.guard';
import { ProvidersController } from './providers.controller';
import { ProvidersService } from './providers.service';

@Module({
  controllers: [ProvidersController],
  providers: [ProvidersService, RolesGuard],
})
export class ProvidersModule {}
