import { JobStatus } from '../job-status.enum';

export interface JobResponseDto {
  id: string;
  title: string;
  providerName: string;
  status: JobStatus;
  scheduledAt: string;
  suburb: string;
  priceCents: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
