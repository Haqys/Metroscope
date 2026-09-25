import { CONTACT } from '@/lib/standalone';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Who Metroscope is, as facts rather than as copy.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Read by `/contact` and by the `Organization` JSON-LD, so a visitor and a
 * search engine cannot be told different things.
 *
 * ── Why the contact details moved to the environment ──
 *
 * They were written here as literals: `halo@metroscope.id`,
 * `+62 812-3456-7890`, and a street address in Renon. None of them reached
 * Metroscope. `metroscope.id` is not a registered domain, so the email
 * bounced, and the phone number is the one every placeholder uses.
 *
 * That was tolerable while they sat in a file nobody had published. It stops
 * being tolerable the moment this site is deployed, because the registration
 * form offers the email as its fallback when submission fails: the visitor
 * whose enquiry has just been lost is handed an address that will lose it
 * again. Worse, the same values were being published as structured data,
 * teaching Google a phone number for this business that belongs to nobody.
 *
 * So each is optional and unset by default, and every consumer renders nothing
 * when it is missing. A business with no phone number listed looks incomplete.
 * A business with the wrong phone number listed looks fraudulent, and costs
 * somebody a call they thought they were making to a school.
 *
 * Set them in the deployment environment:
 *
 *   NEXT_PUBLIC_CONTACT_EMAIL     halo@your-real-domain.com
 *   NEXT_PUBLIC_CONTACT_WHATSAPP  +62 8xx xxxx xxxx
 *   NEXT_PUBLIC_CONTACT_ADDRESS   Jl. …, Denpasar, Bali
 *   NEXT_PUBLIC_CONTACT_HOURS     Senin–Jumat 09.00–17.00 WITA
 *   NEXT_PUBLIC_INSTAGRAM_URL     https://instagram.com/…
 *
 * They belong in `/settings/website` (doc 13 §9.4, Tier 1) once it exists;
 * until then the environment is the single place to change them, which is
 * still one place.
 */
export const ORGANIZATION = {
  name: 'Metroscope',
  legalName: 'Metroscope',
  description:
    'Bimbingan belajar persiapan olimpiade dan kompetisi untuk siswa SD, SMP, dan SMA di Denpasar, Bali.',
  /** Each null until configured. Consumers must handle null, not default it. */
  email: CONTACT.email,
  phone: CONTACT.whatsapp ?? CONTACT.phone,
  hours: CONTACT.hours,
  address: CONTACT.address,
  /**
   * Only profiles that actually exist belong in `sameAs`. It is how a search
   * engine ties this site to an account it already knows, and a placeholder
   * link ties it to nothing.
   */
  sameAs: CONTACT.instagram ? [CONTACT.instagram] : [],
} as const;

/** One line for the contact page, or null when no address is configured. */
export const FULL_ADDRESS = ORGANIZATION.address;
