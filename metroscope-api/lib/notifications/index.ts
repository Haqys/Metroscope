import { ResendChannel } from './channels/resend';
import { ConsoleChannel } from './channels/console';
import type { NotificationChannel } from './channel';

export type { NotificationChannel, OutboundMessage, SendResult } from './channel';

/**
 * Pick the email channel for this environment.
 *
 * The production guard is the important line. Without it, a deploy that forgot
 * RESEND_API_KEY would fall back to the dev sink and report every invoice
 * reminder as delivered while sending nothing, a failure that looks like
 * success on every dashboard and only surfaces as unexplained non-payment weeks
 * later. Refusing to boot is the kinder outcome.
 */
let cached: NotificationChannel | null = null;

export function emailChannel(): NotificationChannel {
  if (cached) return cached;

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? 'Metroscope <noreply@metroscope.id>';
  const replyTo = process.env.EMAIL_REPLY_TO;

  if (apiKey) {
    cached = new ResendChannel(apiKey, from, replyTo);
    return cached;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'RESEND_API_KEY is required in production. Email is the only outbound channel ' +
        '(doc 08 §4), so falling back to the dev sink would silently deliver nothing.',
    );
  }

  cached = new ConsoleChannel();
  return cached;
}

/** Test seam, lets a suite install a stub without an API key. */
export function __setEmailChannel(channel: NotificationChannel | null): void {
  cached = channel;
}
