import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/user-role.enum';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobStatusDto } from './dto/update-job-status.dto';
import { JobsService } from './jobs.service';

type RequestWithUser = Request & { user: { id: string; role: UserRole } };

@Controller('jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  async list(@Req() req: RequestWithUser) {
    const jobs = await this.jobsService.listJobsForUser(req.user);

    return { jobs };
  }

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
  async updateStatus(@Req() req: RequestWithUser, @Param('id') id: string, @Body() dto: UpdateJobStatusDto) {
    const job = await this.jobsService.updateJobStatus(id, req.user.id, dto);

    return {
      message: `Job status updated to ${job.status}`,
      job,
    };
  }
}
