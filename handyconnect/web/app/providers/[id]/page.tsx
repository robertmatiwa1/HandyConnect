import { notFound } from 'next/navigation';
import type { ProviderProfile, ProviderReview } from '@/lib/types';
import ProviderProfileClient from './ProviderProfileClient';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { cache: 'no-store' });
  if (response.status === 404) {
    notFound();
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}`);
  }
  return (await response.json()) as T;
}

export default async function ProviderProfilePage({ params }: { params: { id: string } }) {
  const providerPromise = fetchJson<ProviderProfile>(`/providers/${params.id}`);
  const reviewsPromise = fetchJson<ProviderReview[]>(`/reviews/provider/${params.id}`);

  const [provider, reviews] = await Promise.all([providerPromise, reviewsPromise]);

  return <ProviderProfileClient provider={provider} reviews={reviews} />;
}
