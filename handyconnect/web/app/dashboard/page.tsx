'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import RateProviderModal from '@/components/RateProviderModal';
import { api } from '@/lib/api';
import { formatCurrency, formatDateTime } from '@/lib/format';
import type { JobStatus, JobSummary } from '@/lib/types';
import { useProvidersStore } from '@/store/providers-store';

interface JobsResponse {
  jobs: JobSummary[];
}

interface ReviewResponse {
  providerRating: {
    providerId: string;
    rating: number | null;
    ratingCount: number;
  };
}

const STATUS_STYLES: Record<JobStatus, { label: string; background: string; color: string }> = {
  PENDING: { label: 'Pending', background: '#fef3c7', color: '#b45309' },
  ACCEPTED: { label: 'Accepted', background: '#d1fae5', color: '#047857' },
  IN_PROGRESS: { label: 'In progress', background: '#e0f2fe', color: '#0369a1' },
  COMPLETED: { label: 'Completed', background: '#e0e7ff', color: '#3730a3' },
};

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bookingId = searchParams.get('bookingId');
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobSummary | null>(null);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [dismissedJobIds, setDismissedJobIds] = useState<string[]>([]);
  const { updateProvider } = useProvidersStore();

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<JobsResponse>('/jobs');
      setJobs(response.jobs);
    } catch (err) {
      setError('Unable to load your bookings right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshJobs = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await api.get<JobsResponse>('/jobs');
      setJobs(response.jobs);
    } catch (err) {
      setError('Unable to refresh your bookings.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  useEffect(() => {
    if (!jobs.length) {
      setSelectedJob(null);
      return;
    }

    const dismissed = new Set(dismissedJobIds);
    const pendingReview = jobs.find(
      (job) => job.status === 'COMPLETED' && !job.hasReview && !dismissed.has(job.id),
    );

    if (!pendingReview) {
      setSelectedJob(null);
      return;
    }

    if (!selectedJob || selectedJob.id !== pendingReview.id) {
      setSelectedJob(pendingReview);
    }
  }, [jobs, dismissedJobIds, selectedJob]);

  const handleSubmitReview = useCallback(
    async ({ rating, comment }: { rating: number; comment: string }) => {
      if (!selectedJob) {
        return;
      }

      try {
        setSubmittingReview(true);
        const response = await api.post<ReviewResponse>('/reviews', {
          jobId: selectedJob.id,
          rating,
          comment,
        });

        const { providerId, rating: providerRating, ratingCount } = response.providerRating;
        setJobs((prev) =>
          prev.map((job) =>
            job.id === selectedJob.id
              ? {
                  ...job,
                  hasReview: true,
                }
              : job,
          ),
        );
        updateProvider({ id: providerId, rating: providerRating ?? null, ratingCount });
        setDismissedJobIds((prev) => (prev.includes(selectedJob.id) ? prev : [...prev, selectedJob.id]));
        setSelectedJob(null);
      } catch (err) {
        setError('Unable to submit review right now.');
      } finally {
        setSubmittingReview(false);
      }
    },
    [selectedJob, updateProvider],
  );

  const handleDismissReview = useCallback(() => {
    if (selectedJob) {
      setDismissedJobIds((prev) => (prev.includes(selectedJob.id) ? prev : [...prev, selectedJob.id]));
    }
    setSelectedJob(null);
  }, [selectedJob]);

  const activeJobs = useMemo(() => {
    const activeStatuses: JobStatus[] = ['PENDING', 'ACCEPTED', 'IN_PROGRESS'];
    return jobs.filter((job) => activeStatuses.includes(job.status));
  }, [jobs]);

  const pastJobs = useMemo(() => jobs.filter((job) => job.status === 'COMPLETED'), [jobs]);

  return (
    <div className="stack-lg">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h2 style={{ margin: 0 }}>Your bookings</h2>
        <button className="button" onClick={() => router.push('/')}>Book another provider</button>
      </div>
      {bookingId ? <p style={{ color: '#1f2937' }}>Booking confirmed! Reference: {bookingId}</p> : null}
      {error ? <p style={{ color: '#dc2626' }}>{error}</p> : null}
      {loading ? (
        <div className="card">
          <p className="text-muted">Loading your bookings…</p>
        </div>
      ) : (
        <div className="stack-lg">
          <Section title="Active jobs" emptyMessage="No active jobs yet." jobs={activeJobs} />
          <Section title="Past jobs" emptyMessage="No completed jobs." jobs={pastJobs} />
          <button className="button" onClick={refreshJobs} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh bookings'}
          </button>
        </div>
      )}
      <RateProviderModal
        visible={Boolean(selectedJob)}
        providerName={selectedJob?.providerName ?? ''}
        onClose={handleDismissReview}
        onSubmit={handleSubmitReview}
        submitting={submittingReview}
      />
    </div>
  );
}

function Section({ title, jobs, emptyMessage }: { title: string; jobs: JobSummary[]; emptyMessage: string }) {
  return (
    <section className="card">
      <h3 className="section-title" style={{ marginTop: 0 }}>
        {title}
      </h3>
      {jobs.length === 0 ? (
        <p className="text-muted">{emptyMessage}</p>
      ) : (
        <div className="stack">
          {jobs.map((job) => (
            <article key={job.id} className="job-card">
              <header className="job-card__header">
                <h4 className="job-card__title">{job.title}</h4>
                <StatusBadge status={job.status} />
              </header>
              <p className="text-muted" style={{ marginBottom: 4 }}>
                with {job.providerName}
              </p>
              <p className="text-muted" style={{ marginBottom: 4 }}>
                {formatDateTime(job.scheduledAt)}
              </p>
              <p className="text-muted" style={{ marginBottom: 4 }}>
                {job.suburb}
              </p>
              <p style={{ fontWeight: 600, marginBottom: 4 }}>{formatCurrency(job.priceCents / 100)}</p>
              {job.notes ? <p style={{ color: '#374151' }}>Notes: {job.notes}</p> : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: JobStatus }) {
  const style = STATUS_STYLES[status];
  return (
    <span className="badge" style={{ backgroundColor: style.background, color: style.color }}>
      {style.label}
    </span>
  );
}
