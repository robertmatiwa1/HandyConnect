import { Controller, Get, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/user-role.enum';
import { OpsService } from './ops.service';

@Controller('ops')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class OpsController {
  constructor(private readonly opsService: OpsService) {}

  @Get('disputes')
  async listDisputes() {
    const disputes = await this.opsService.listDisputes();
    return { disputes };
  }

  @Get('refunds')
  async listRefunds() {
    const refunds = await this.opsService.listRefunds();
    return { refunds };
  }

  @Get('provider-verifications')
  async listProviders() {
    const providers = await this.opsService.listProviderVerifications();
    return { providers };
  }
}
