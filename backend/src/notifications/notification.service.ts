export type NotificationType = 'JOB_REQUESTED' | 'JOB_ACCEPTED' | 'PAYOUT_RELEASED';

/**
 * Temporary notification bridge. In the future this should integrate with
 * Twilio/Expo push so providers and customers receive real alerts.
 */
export function sendNotification(userId: string, type: NotificationType, message: string): void {
  if (!userId) {
    console.warn('[Notification] Missing userId for notification', { type, message });
    return;
  }

  console.log(`[Notification] User ${userId} (${type}): ${message}`);
}
