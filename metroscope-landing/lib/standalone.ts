/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Standalone mode: the marketing site without the API behind it.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Set `NEXT_PUBLIC_STANDALONE=true` to deploy this site on its own, before
 * `api.metroscope.id` exists. Everything that needs the API is either served
 * from `lib/mock/content.ts` or taken off the page, so a visitor never reaches
 * an empty section, a dead link or a button that cannot do anything.
 *
 * ── Why a flag rather than a fallback ──
 *
 * The content loaders already degrade to an empty list when the API is
 * unreachable, and that is the right behaviour WITH an API: a blip empties one
 * section for five minutes and the site keeps selling. Falling back to sample
 * content instead would be much worse, because the failure is invisible. A
 * price, a mentor's name or a competition deadline that is quietly wrong is
 * more damaging than one that is quietly missing, and nobody would find out
 * until a parent turned up expecting a programme that does not exist.
 *
 * So the two behaviours are chosen deliberately, by configuration, and the
 * flag is read in one place. In standalone the loaders never call the API at
 * all: no failed fetch at build time, no retry every five minutes, no error
 * lines in the deployment log that somebody has to learn to ignore.
 *
 * ── It is NOT a production posture ──
 *
 * Sample content is not this business's content. `app/robots.ts` blocks
 * crawlers while the flag is on, and every page carries `noindex`, so a review
 * deployment cannot be indexed and cannot outrank the real site later. Turning
 * the flag off is the whole of "go live" for this project: the loaders start
 * calling the API, the login link comes back, and the forms post again.
 *
 * `NEXT_PUBLIC_` because the navbar and the forms are client components and
 * have to know too. It is a build-time constant, not a secret, and inlining it
 * is what makes `STANDALONE &&` disappear from the production bundle.
 */
export const STANDALONE = process.env.NEXT_PUBLIC_STANDALONE === 'true';

/**
 * Contact details, from the environment, with NO fallbacks.
 *
 * `lib/organization.ts` used to hardcode `halo@metroscope.id`, a phone number
 * of `+62 812-3456-7890` and a street address, all placeholders. The email was
 * the one the registration form offered when it could not submit, and
 * `metroscope.id` is not a registered domain, so the advice it gave a visitor
 * whose enquiry had just failed was to write to an address that bounces.
 *
 * Undefined means "we do not have this yet", and every consumer renders
 * nothing rather than something false. A missing phone number costs a visitor
 * one channel; a wrong one costs them a phone call and their trust.
 */
export const CONTACT = {
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || null,
  phone: process.env.NEXT_PUBLIC_CONTACT_PHONE?.trim() || null,
  whatsapp: process.env.NEXT_PUBLIC_CONTACT_WHATSAPP?.trim() || null,
  instagram: process.env.NEXT_PUBLIC_INSTAGRAM_URL?.trim() || null,
  address: process.env.NEXT_PUBLIC_CONTACT_ADDRESS?.trim() || null,
  hours: process.env.NEXT_PUBLIC_CONTACT_HOURS?.trim() || null,
} as const;

/** Is there any way at all for a reader to reach a human? */
export const HAS_CONTACT_CHANNEL = Boolean(CONTACT.email || CONTACT.whatsapp || CONTACT.phone);

/** A `wa.me` deep link for the reader's own WhatsApp, when a number is set. */
export function whatsappLink(text?: string): string | null {
  const digits = (CONTACT.whatsapp ?? CONTACT.phone ?? '').replace(/[^0-9]/g, '');
  if (!digits) return null;
  const query = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${digits}${query}`;
}

/** A prefilled `mailto:`, when an address is set. */
export function mailtoLink(subject: string, body?: string): string | null {
  if (!CONTACT.email) return null;
  const params = new URLSearchParams({ subject });
  if (body) params.set('body', body);
  return `mailto:${CONTACT.email}?${params.toString()}`;
}
