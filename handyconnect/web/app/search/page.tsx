'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ProviderCard from '@/components/ProviderCard';
import { api } from '@/lib/api';
import type { ProviderSummary } from '@/lib/types';
import { useProvidersStore } from '@/store/providers-store';

export default function SearchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const skill = searchParams.get('skill') ?? 'plumber';
  const suburb = searchParams.get('suburb') ?? 'Bellville';
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { upsertMany } = useProvidersStore();

  const fetchProviders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const query = new URLSearchParams();
      if (skill) {
        query.set('skill', skill);
      }
      if (suburb) {
        query.set('suburb', suburb);
      }
      const queryString = query.toString();
      const response = await api.get<ProviderSummary[]>(queryString ? `/providers?${queryString}` : '/providers');
      setProviders(response);
      upsertMany(response);
    } catch (err) {
      setError('Unable to load providers. Please try again.');
      setProviders([]);
    } finally {
      setLoading(false);
    }
  }, [skill, suburb, upsertMany]);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const heading = useMemo(
    () => `Results for ${skill || 'all skills'} in ${suburb || 'all suburbs'}`,
    [skill, suburb],
  );

  return (
    <div className="stack-lg">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ margin: 0 }}>{heading}</h2>
        <button className="button" onClick={() => router.push('/')}>
          Update search
        </button>
      </div>
      {error ? <p style={{ color: '#dc2626' }}>{error}</p> : null}
      {loading && providers.length === 0 ? (
        <p className="text-muted">Loading providers…</p>
      ) : providers.length === 0 ? (
        <p className="text-muted">No providers found.</p>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {providers.map((provider) => (
            <ProviderCard key={provider.id} provider={provider} />
          ))}
        </div>
      )}
    </div>
  );
}
