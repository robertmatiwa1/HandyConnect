'use client';

import React, { FormEvent, useEffect, useState } from 'react';
import styles from './RateProviderModal.module.css';

interface RateProviderModalProps {
  visible: boolean;
  providerName: string;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (input: { rating: number; comment: string }) => void;
}

export const RateProviderModal: React.FC<RateProviderModalProps> = ({
  visible,
  providerName,
  submitting,
  onClose,
  onSubmit,
}) => {
  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (visible) {
      setRating(5);
      setComment('');
    }
  }, [visible, providerName]);

  if (!visible) {
    return null;
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({ rating, comment });
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        <h3>Rate {providerName}</h3>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label className="label" htmlFor="rating">
            Rating
          </label>
          <select
            id="rating"
            value={rating}
            onChange={(event) => setRating(Number(event.target.value))}
            className={styles.select}
          >
            {[5, 4, 3, 2, 1].map((value) => (
              <option key={value} value={value}>
                {value} star{value === 1 ? '' : 's'}
              </option>
            ))}
          </select>
          <label className="label" htmlFor="comment">
            Comment
          </label>
          <textarea
            id="comment"
            className={styles.textarea}
            rows={4}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Share a short review"
          />
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={onClose} disabled={submitting}>
              Not now
            </button>
            <button type="submit" className="button" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit review'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RateProviderModal;
