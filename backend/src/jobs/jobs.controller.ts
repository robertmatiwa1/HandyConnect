import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/user-role.enum';

@Controller('jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class JobsController {
  @Post()
  @Roles(UserRole.CUSTOMER)
  createJob(@Body() body: { title: string; description: string }) {
    return {
      message: 'Job created',
      job: {
        id: 'job_' + Math.random().toString(36).substring(2, 10),
        ...body,
      },
    };
  }
}
