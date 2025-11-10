'use client';

import Link from 'next/link';
import React from 'react';
import { formatCurrency } from '@/lib/format';
import type { ProviderSummary } from '@/lib/types';
import Rating from './Rating';
import styles from './ProviderCard.module.css';

interface ProviderCardProps {
  provider: ProviderSummary;
}

const ProviderCard: React.FC<ProviderCardProps> = ({ provider }) => {
  return (
    <Link href={`/providers/${provider.id}`} className={styles.card}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.name}>{provider.name}</h3>
          <p className={styles.meta}>
            {provider.skill} • {provider.suburb}
          </p>
        </div>
        {typeof provider.rating === 'number' && (
          <Rating value={provider.rating} count={provider.ratingCount ?? undefined} />
        )}
      </div>
      {provider.hourlyRate ? (
        <p className={styles.rate}>From {formatCurrency(provider.hourlyRate)}/hr</p>
      ) : null}
      {provider.bio ? <p className={styles.bio}>{provider.bio}</p> : null}
    </Link>
  );
};

export default ProviderCard;
