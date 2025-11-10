'use client';

import React from 'react';
import styles from './Rating.module.css';

interface RatingProps {
  value: number;
  count?: number | null;
}

export const Rating: React.FC<RatingProps> = ({ value, count }) => {
  return (
    <div className={styles.rating}>
      <span className={styles.stars} aria-hidden>★</span>
      <span className={styles.value}>{value.toFixed(1)}</span>
      {typeof count === 'number' ? <span className={styles.count}>({count})</span> : null}
    </div>
  );
};

export default Rating;
