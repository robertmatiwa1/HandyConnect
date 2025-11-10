import { JobStatus } from '../job-status.enum';

export class UpdateJobStatusDto {
  status!: JobStatus;
}
