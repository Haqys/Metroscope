/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  NotificationChannel, the seam between "what to say" and "how to send it".
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Email is the only outbound channel (doc 08 §4, WhatsApp removed 2026-07-29).
 * The interface still exists, for two reasons that are not "we might add SMS":
 *
 *   1. The worker must be testable without a provider. `console` implements
 *      this and is what makes the whole pipeline provable end to end before an
 *      API key exists.
 *   2. Providers get swapped. Resend is a good default; being locked to it
 *      because `dispatch()` calls `resend.emails.send()` directly is a cost
 *      paid later, at the worst moment.
 *
 * Deliberately NOT abstracted here: recipient resolution, templating and
 * preferences. Those are the same regardless of provider, so they live in the
 * dispatcher. A channel does one thing, put this text in front of that person.
 */

export interface OutboundMessage {
  to: string;
  subject: string;
  /** Pre-rendered. Channels do not template, see templates.ts. */
  html: string;
  text: string;
  /** Threading hint; the provider may ignore it. */
  tag?: string;
}

export type SendResult =
  | { ok: true; providerMessageId: string | null }
  /**
   * `retryable` is the whole point of this type. A 500 from the provider and a
   * malformed recipient both fail, but retrying the second one forever burns
   * the queue and hides a data problem. The channel knows which it is; the
   * worker does not.
   */
  | { ok: false; retryable: boolean; error: string };

export interface NotificationChannel {
  readonly name: 'EMAIL' | 'IN_APP';
  send(message: OutboundMessage): Promise<SendResult>;
}
