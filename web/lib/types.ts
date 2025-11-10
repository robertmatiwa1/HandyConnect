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

export type JobStatus = 'PENDING' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED';

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
