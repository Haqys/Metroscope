import { logger } from '@/lib/logger';
import type { NotificationChannel, OutboundMessage, SendResult } from '../channel';

/**
 * Resend adapter.
 *
 * Called over plain fetch rather than the `resend` SDK: this is one POST with a
 * bearer token, and the SDK would add a dependency whose main value is types we
 * already have. It also lets the timeout and the retryable/permanent split be
 * explicit rather than inherited.
 *
 * ⚠️ DELIVERABILITY IS NOT OPTIONAL HERE. Email is the only channel. There is
 * no WhatsApp fallback any more (doc 08 §4.1). A message that lands in spam is
 * a parent who never learns they owe money. SPF, DKIM and DMARC on the sending
 * domain are part of shipping this, not a follow-up.
 */
export class ResendChannel implements NotificationChannel {
  readonly name = 'EMAIL' as const;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly replyTo?: string,
  ) {}

  async send(message: OutboundMessage): Promise<SendResult> {
    let res: Response;
    try {
      res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
          ...(this.replyTo ? { reply_to: this.replyTo } : {}),
          /**
           * Resend allows only letters, numbers, underscores and dashes in a tag
           * value. Our topics are dotted (`notification.lead-received`), which
           * it rejects with a 422, a permanent failure that would have dropped
           * every single email while the dev sink reported success.
           */
          ...(message.tag
            ? { tags: [{ name: 'topic', value: message.tag.replace(/[^A-Za-z0-9_-]/g, '_') }] }
            : {}),
        }),
        // A hung provider must not hold a serverless invocation to its timeout.
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      // Network failure, DNS, or our own abort. Always worth another go.
      return {
        ok: false,
        retryable: true,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    const body = await res.text();

    if (res.ok) {
      let providerMessageId: string | null = null;
      try {
        providerMessageId = (JSON.parse(body) as { id?: string }).id ?? null;
      } catch {
        // A 2xx with an unparseable body still means accepted; the id is a nicety.
      }
      return { ok: true, providerMessageId };
    }

    /**
     * 4xx is our fault and will fail identically forever, a malformed address,
     * an unverified domain, a revoked key. Retrying those buries the real error
     * under attempt counts. 429 is the exception: it is a 4xx that means "later".
     */
    const retryable = res.status === 429 || res.status >= 500;

    logger.warn('resend_send_failed', {
      status: res.status,
      retryable,
      body: body.slice(0, 500),
    });

    return { ok: false, retryable, error: `resend ${res.status}: ${body.slice(0, 300)}` };
  }
}
