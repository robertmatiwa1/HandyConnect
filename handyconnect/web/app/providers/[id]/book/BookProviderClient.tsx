'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import type { ProviderProfile, ProviderSummary } from '@/lib/types';
import { useProvidersStore } from '@/store/providers-store';

interface BookingResponse {
  job: {
    id: string;
    status: string;
    priceCents?: number;
  };
}

interface CheckoutResponse {
  checkoutUrl: string;
}

type ProviderData = ProviderSummary | ProviderProfile;

export default function BookProviderClient({ providerId }: { providerId: string }) {
  const router = useRouter();
  const { providers, updateProvider } = useProvidersStore();
  const [provider, setProvider] = useState<ProviderData | null>(providers[providerId] ?? null);
  const [loadingProvider, setLoadingProvider] = useState(!provider);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('10:00');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProvider = useCallback(async () => {
    try {
      setLoadingProvider(true);
      const response = await api.get<ProviderProfile>(`/providers/${providerId}`);
      setProvider(response);
      updateProvider(response);
    } catch (err) {
      setError('Unable to load provider details.');
    } finally {
      setLoadingProvider(false);
    }
  }, [providerId, updateProvider]);

  useEffect(() => {
    if (!provider) {
      fetchProvider();
    }
  }, [fetchProvider, provider]);

  const hourlyRate = useMemo(() => {
    const rate = provider?.hourlyRate;
    return typeof rate === 'number' ? rate : 750;
  }, [provider]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const scheduledAt = new Date(`${date}T${time}:00`).toISOString();

    try {
      setSubmitting(true);
      const booking = await api.post<BookingResponse>('/jobs', {
        providerId,
        scheduledAt,
        notes,
      });
      const jobId = booking.job.id;
      const amountCents = booking.job.priceCents ?? Math.round(hourlyRate * 100);
      const checkout = await api.post<CheckoutResponse>('/payments/checkout', {
        jobId,
        amountCents,
      });
      const search = new URLSearchParams({ jobId, checkoutUrl: checkout.checkoutUrl }).toString();
      router.push(`/payment?${search}`);
    } catch (err) {
      console.error(err);
      setError('Booking failed. Please try again later.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingProvider) {
    return <p className="text-muted">Loading provider…</p>;
  }

  if (!provider) {
    return <p style={{ color: '#dc2626' }}>Provider not found.</p>;
  }

  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <h2 style={{ marginTop: 0 }}>Book {provider.name}</h2>
      <p className="text-muted">
        {provider.skill} • {provider.suburb}
      </p>
      {provider.hourlyRate ? (
        <p style={{ fontWeight: 600 }}>Hourly rate: {formatCurrency(provider.hourlyRate)}</p>
      ) : null}
      <form onSubmit={handleSubmit} className="stack">
        <div>
          <label className="label" htmlFor="date">
            Date
          </label>
          <input
            id="date"
            type="date"
            className="input"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="time">
            Time
          </label>
          <input
            id="time"
            type="time"
            className="input"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="notes">
            Notes
          </label>
          <textarea
            id="notes"
            className="input"
            style={{ minHeight: 120, resize: 'vertical' }}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Add any details for the provider"
          />
        </div>
        {error ? <p style={{ color: '#dc2626' }}>{error}</p> : null}
        <button type="submit" className="button" disabled={submitting}>
          {submitting ? 'Booking…' : 'Confirm booking'}
        </button>
      </form>
    </div>
  );
}
