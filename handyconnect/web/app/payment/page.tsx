'use client';

import { useMemo, useState, type SyntheticEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const successHints = ['success', 'status=paid', 'status=success'];

export default function PaymentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get('jobId');
  const encodedUrl = searchParams.get('checkoutUrl');
  const checkoutUrl = useMemo(() => {
    if (!encodedUrl) {
      return null;
    }
    try {
      return decodeURIComponent(encodedUrl);
    } catch {
      return encodedUrl;
    }
  }, [encodedUrl]);
  const [completed, setCompleted] = useState(false);

  const handleManualComplete = () => {
    if (!jobId) {
      router.push('/dashboard');
      return;
    }
    router.push(`/dashboard?bookingId=${jobId}`);
  };

  const handleFrameNavigation = (event: SyntheticEvent<HTMLIFrameElement, Event>) => {
    try {
      const frame = event.currentTarget;
      const url = frame.contentWindow?.location?.href;
      if (!url) {
        return;
      }
      const normalized = url.toLowerCase();
      if (successHints.some((hint) => normalized.includes(hint))) {
        setCompleted(true);
        handleManualComplete();
      }
    } catch {
      // Cross-origin access is expected; ignore errors.
    }
  };

  return (
    <div className="stack-lg" style={{ maxWidth: 820, margin: '0 auto' }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Complete your payment</h2>
        <p className="text-muted">
          Your secure checkout will open below. If it does not load, use the button to open it in a new tab.
        </p>
        {checkoutUrl ? (
          <>
            <iframe
              src={checkoutUrl}
              title="Payment checkout"
              className="payment-frame"
              style={{ width: '100%', minHeight: 520, border: '1px solid #e5e7eb', borderRadius: 12 }}
              onLoad={handleFrameNavigation}
            />
            <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
              <a className="button" href={checkoutUrl} target="_blank" rel="noopener noreferrer">
                Open checkout in new tab
              </a>
              <button type="button" className="button" onClick={handleManualComplete} disabled={completed}>
                I've completed payment
              </button>
            </div>
          </>
        ) : (
          <p style={{ color: '#dc2626' }}>Checkout link missing. Return to your dashboard to try again.</p>
        )}
      </div>
    </div>
  );
}
