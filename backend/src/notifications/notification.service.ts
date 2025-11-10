export type NotificationType = 'JOB_REQUESTED' | 'JOB_ACCEPTED' | 'PAYOUT_RELEASED';

export function sendNotification(userId: string, type: NotificationType, message: string): void {
  if (!userId) {
    console.warn('[Notification] Missing userId for notification', { type, message });
    return;
  }

  console.log(`[Notification] User ${userId} (${type}): ${message}`);
}
