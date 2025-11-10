export interface ProviderSummary {
  id: string;
  name: string;
  skill: string;
  suburb: string;
  hourlyRate?: number | null;
  rating?: number | null;
  ratingCount?: number | null;
  bio?: string | null;
  experienceYears?: number | null;
  verified?: boolean;
  photoUrl?: string | null;
  portfolio?: string[];
}

export interface ProviderProfile extends ProviderSummary {
  ratingCount: number;
  verified: boolean;
  portfolio: string[];
}

export interface ProviderReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

export type ProviderUpdate = Partial<ProviderSummary> & { id: string };

export type JobStatus = 'PENDING' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface JobSummary {
  id: string;
  providerId: string;
  title: string;
  providerName: string;
  status: JobStatus;
  scheduledAt: string;
  suburb: string;
  priceCents: number;
  notes: string | null;
  hasReview: boolean;
}

export interface OpsDispute {
  id: string;
  paymentId: string;
  jobId: string;
  amountCents: number;
  status: string;
  reason: string;
  submittedAt: string;
  resolvedAt: string | null;
  customerName: string;
  providerName: string;
}

export interface OpsRefund {
  id: string;
  jobId: string;
  amountCents: number;
  status: string;
  reason: string | null;
  requestedAt: string;
  processedAt: string | null;
  customerName: string;
  providerName: string;
}

export interface OpsProviderVerification {
  id: string;
  name: string;
  skill: string;
  suburb: string;
  hourlyRate: number | null;
  verified: boolean;
  rating: number | null;
  ratingCount: number;
  submittedAt: string;
}
