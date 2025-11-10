'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect } from 'react';
import Rating from '@/components/Rating';
import { formatCurrency } from '@/lib/format';
import type { ProviderProfile, ProviderReview } from '@/lib/types';
import { useProvidersStore } from '@/store/providers-store';
import styles from './provider-profile.module.css';

interface ProviderProfileClientProps {
  provider: ProviderProfile;
  reviews: ProviderReview[];
}

export default function ProviderProfileClient({ provider, reviews }: ProviderProfileClientProps) {
  const { providers, updateProvider } = useProvidersStore();
  const storedProvider = providers[provider.id];
  const displayProvider = { ...provider, ...(storedProvider ?? {}) };

  useEffect(() => {
    updateProvider(provider);
  }, [provider, updateProvider]);

  return (
    <div className="stack-lg">
      <div className="card">
        {displayProvider.photoUrl ? (
          <div className={styles.heroImage}>
            <Image
              src={displayProvider.photoUrl}
              alt={displayProvider.name}
              fill
              sizes="(max-width: 768px) 100vw, 720px"
            />
          </div>
        ) : null}
        <div className={styles.header}>
          <div>
            <h2>{displayProvider.name}</h2>
            <p className="text-muted">
              {displayProvider.skill} • {displayProvider.suburb}
            </p>
            {typeof displayProvider.experienceYears === 'number' ? (
              <p className="text-muted">
                {displayProvider.experienceYears}{' '}
                {displayProvider.experienceYears === 1 ? 'year' : 'years'} experience
              </p>
            ) : null}
            {displayProvider.bio ? <p className={styles.bio}>{displayProvider.bio}</p> : null}
          </div>
          <div className={styles.meta}>
            {typeof displayProvider.rating === 'number' ? (
              <Rating value={displayProvider.rating} count={displayProvider.ratingCount ?? undefined} />
            ) : null}
            {displayProvider.hourlyRate ? (
              <p className={styles.rate}>Hourly rate: {formatCurrency(displayProvider.hourlyRate)}</p>
            ) : null}
            {displayProvider.verified ? <span className={styles.verified}>Verified</span> : null}
          </div>
        </div>
        <div className={styles.actions}>
          <Link href={`/providers/${displayProvider.id}/book`} className="button">
            Book {displayProvider.name}
          </Link>
        </div>
      </div>

      <section className="card">
        <h3 className="section-title">Reviews</h3>
        {reviews.length === 0 ? (
          <p className="text-muted">No reviews yet.</p>
        ) : (
          <div className="stack">
            {reviews.map((review) => (
              <div key={review.id} className={styles.reviewCard}>
                <Rating value={review.rating} />
                {review.comment ? <p className={styles.reviewComment}>{review.comment}</p> : null}
                <p className={styles.reviewDate}>{new Date(review.createdAt).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {displayProvider.portfolio && displayProvider.portfolio.length > 0 ? (
        <section className="card">
          <h3 className="section-title">Portfolio</h3>
          <div className={styles.portfolioGrid}>
            {displayProvider.portfolio.map((item) => (
              <div key={item} className={styles.portfolioItem}>
                <Image src={item} alt="Portfolio item" fill sizes="(max-width: 768px) 100vw, 400px" />
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
