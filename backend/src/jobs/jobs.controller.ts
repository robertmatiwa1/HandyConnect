import { Body, Controller, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/user-role.enum';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobStatusDto } from './dto/update-job-status.dto';
import { JobsService } from './jobs.service';

type RequestWithUser = Request & { user: { id: string } };

@Controller('jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  @Roles(UserRole.CUSTOMER)
  async createJob(@Req() req: RequestWithUser, @Body() dto: CreateJobDto) {
    const job = await this.jobsService.createJob(req.user.id, dto);

    return {
      message: 'Job created',
      job,
    };
  }

  @Patch(':id/status')
  @Roles(UserRole.PROVIDER)
  updateStatus(@Req() req: RequestWithUser, @Param('id') id: string, @Body() dto: UpdateJobStatusDto) {
    const job = this.jobsService.updateJobStatus(id, req.user.id, dto);

    return {
      message: `Job status updated to ${job.status}`,
      job,
    };
  }
}
