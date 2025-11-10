import { JobStatus } from './job-status.enum';

export interface JobRecord {
  id: string;
  customerId: string;
  providerProfileId: string;
  providerUserId: string;
  providerName: string;
  title: string;
  notes: string | null;
  scheduledAt: string;
  suburb: string;
  priceCents: number;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
}
