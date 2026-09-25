import { logger } from '@/lib/logger';
import type { NotificationChannel, OutboundMessage, SendResult } from '../channel';

/**
 * Development sink. Renders and logs, sends nothing.
 *
 * This exists so the pipeline, outbox → claim → render → record → retry, can
 * be exercised and asserted before anyone has a Resend key or a verified domain.
 * The rendered subject and body are stored on the `notifications` row by the
 * dispatcher, so a test can prove exactly what a recipient would have received.
 *
 * ⚠️ It refuses to run in production. Silently "succeeding" at sending nothing
 * is the worst possible failure mode for a billing reminder: every dashboard
 * would show delivered, and no parent would have been told anything. The
 * selector in index.ts throws rather than falling back to this in production.
 */
export class ConsoleChannel implements NotificationChannel {
  readonly name = 'EMAIL' as const;

  async send(message: OutboundMessage): Promise<SendResult> {
    logger.info('email_not_sent_dev_sink', {
      to: message.to,
      subject: message.subject,
      tag: message.tag,
      preview: message.text.slice(0, 200),
    });
    return { ok: true, providerMessageId: null };
  }
}
