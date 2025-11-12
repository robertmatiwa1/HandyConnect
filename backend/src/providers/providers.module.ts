import { Module } from '@nestjs/common';

import { RolesGuard } from '../common/guards/roles.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { ProvidersController } from './providers.controller';
import { ProvidersService } from './providers.service';

@Module({
  imports: [PrismaModule],
  controllers: [ProvidersController],
  providers: [ProvidersService, RolesGuard],
})
export class ProvidersModule {}
