import { JobStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateJobStatusDto {
  @IsEnum(JobStatus)
  status: JobStatus;
}
