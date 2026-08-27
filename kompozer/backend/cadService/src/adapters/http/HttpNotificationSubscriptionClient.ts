import { URL } from 'url';
import { ResourceConflictError } from '../../domain/entities/errors';
import { NotificationSubscriptionClient } from '../../domain/ports/NotificationSubscriptionClient';
import { HttpRequestFailure, requestJson } from './httpRetry';

/** HTTP adapter that creates notification subscriptions for product availability. */
export class HttpNotificationSubscriptionClient implements NotificationSubscriptionClient {
  constructor(
    private readonly notificationBaseUrl: string,
    private readonly timeoutMs = 5000,
  ) {}

  // POST /notifications/subscriptions is an upsert (createSubscription
  // matches on userId+scope+targetId+channel) — idempotent, safe to retry
  // on timeout and 5xx as well as connection errors.
  async ensureProductAvailabilitySubscription(ownerId: string, sku: string): Promise<void> {
    const url = new URL('/notifications/subscriptions', this.notificationBaseUrl);
    const body = JSON.stringify({
      scope: 'PRODUCT',
      targetId: sku,
      events: ['AVAILABILITY_CHANGED'],
      channel: 'IN_APP',
    });

    try {
      await requestJson<unknown>(url, {
        method: 'POST',
        timeoutMs: this.timeoutMs,
        body,
        headers: {
          'content-type': 'application/json',
          'content-length': String(Buffer.byteLength(body)),
          'x-user-id': ownerId,
        },
      });
    } catch (err) {
      if (err instanceof HttpRequestFailure) {
        if (err.kind === 'timeout') throw new ResourceConflictError('Notification service request timed out');
        if (err.kind === 'http') {
          throw new ResourceConflictError(
            `Notification service rejected subscription for ${sku} with status ${err.status}`,
          );
        }
      }
      throw new ResourceConflictError('Notification service request failed');
    }
  }
}
