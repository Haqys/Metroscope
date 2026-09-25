import Image from 'next/image';
import Link from 'next/link';

import { ArticleCard } from '@/components/marketing/article-card';
import { CompetitionCard } from '@/components/marketing/competition-card';
import { ProgramCard } from '@/components/marketing/program-card';
import { Reveal } from '@/components/marketing/scroll-fx';
import { listArticles } from '@/lib/articles-api';
import { listCompetitions } from '@/lib/competitions-api';
import { listPublicPrograms } from '@/lib/programs-api';
import { listFaq, listMentors, listTestimonials } from '@/lib/surfaces-api';
import { ContactForm } from '@/components/marketing/contact-form';
import { FaqList } from '@/components/marketing/faq-list';
import { MentorCard } from '@/components/marketing/mentor-card';
import { TestimonialQuote } from '@/components/marketing/testimonial-quote';
import type { Block } from '@/lib/pages-api';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Block → React (doc 13 §9.3).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * "Adding a block type is one Zod schema + one React component + one registry
 * entry." This is the second of those three.
 *
 * `RENDERERS` is a closed map, and an unknown type renders **nothing**. That is
 * deliberate and it matters in both directions: the API already refuses to
 * store an unregistered type, so an unknown one here means the two halves have
 * drifted, and rendering nothing degrades a page rather than crashing it. A
 * marketing page must not 500 because somebody deployed the API first.
 *
 * No `dangerouslySetInnerHTML` anywhere in this file. Props are typed values
 * placed into elements, never markup, so an editor cannot inject script through
 * a block, the same property the article renderer has.
 */

/** Props arrive as `Record<string, unknown>`; these narrow without throwing. */
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback);
const list = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v)
    ? (v.filter((i) => i && typeof i === 'object') as Record<string, unknown>[])
    : [];

/** Paragraphs from plain text, never HTML. Blank line separates. */
function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((para, i) => (
          <p key={i} className="mt-5 leading-[1.8] text-neutral-700">
            {para}
          </p>
        ))}
    </>
  );
}

/**
 * A block's image URL, resolved by the API onto the block's props.
 *
 * The editor stores a `mediaId`; the public read joins it to `media_assets` and
 * adds `mediaUrl`/`mediaAlt` beside it, so this component never has to know how
 * storage keys become URLs.
 */
function blockImage(props: Record<string, unknown>) {
  return { url: str(props.mediaUrl), alt: str(props.mediaAlt) ?? '' };
}

function Hero({ props }: { props: Record<string, unknown> }) {
  const heading = str(props.heading);
  if (!heading) return null;
  const { url, alt } = blockImage(props);

  return (
    <section className="container pt-14 pb-16 lg:pt-24">
      <Reveal>
        {str(props.eyebrow) && (
          <p className="text-maroon text-xs font-medium tracking-[0.35em] uppercase">
            {str(props.eyebrow)}
          </p>
        )}
        <h1 className="mt-5 max-w-3xl font-serif text-[clamp(2.5rem,6vw,5rem)] leading-[1.04] font-medium tracking-tight text-neutral-900">
          {heading}
        </h1>
        {str(props.subheading) && (
          <p className="mt-6 max-w-xl text-lg leading-relaxed font-light text-neutral-500">
            {str(props.subheading)}
          </p>
        )}
        {str(props.ctaLabel) && str(props.ctaHref) && (
          <Link
            href={str(props.ctaHref)!}
            className="bg-navy hover:bg-navy-dark mt-8 inline-block rounded-full px-7 py-3.5 text-sm font-medium text-white transition-colors"
          >
            {str(props.ctaLabel)}
          </Link>
        )}
      </Reveal>
      {url && (
        <div className="relative mt-12 aspect-[21/9] overflow-hidden rounded-3xl bg-neutral-100">
          <Image src={url} alt={alt} fill sizes="100vw" className="object-cover" priority />
        </div>
      )}
    </section>
  );
}

function RichText({ props }: { props: Record<string, unknown> }) {
  const text = str(props.text);
  if (!text) return null;
  return (
    <section className="container py-10">
      <div className="max-w-2xl">
        {str(props.heading) && (
          <h2 className="font-serif text-3xl font-medium tracking-tight text-neutral-900">
            {str(props.heading)}
          </h2>
        )}
        <Paragraphs text={text} />
      </div>
    </section>
  );
}

function CtaBanner({ props }: { props: Record<string, unknown> }) {
  const heading = str(props.heading);
  const label = str(props.ctaLabel);
  const href = str(props.ctaHref);
  if (!heading || !label || !href) return null;

  return (
    <section className="container py-16">
      <div className="from-navy to-maroon rounded-3xl bg-gradient-to-br px-8 py-14 text-center text-white">
        <h2 className="font-serif text-3xl font-medium tracking-tight">{heading}</h2>
        {str(props.text) && (
          <p className="mx-auto mt-3 max-w-xl font-light text-white/80">{str(props.text)}</p>
        )}
        <Link
          href={href}
          className="text-navy mt-8 inline-flex rounded-full bg-white px-7 py-3.5 text-sm font-semibold transition-opacity hover:opacity-90"
        >
          {label}
        </Link>
      </div>
    </section>
  );
}

function StatRow({ props }: { props: Record<string, unknown> }) {
  const items = list(props.items);
  if (items.length === 0) return null;
  return (
    <section className="container py-16">
      {str(props.heading) && (
        <h2 className="font-serif text-3xl font-medium tracking-tight text-neutral-900">
          {str(props.heading)}
        </h2>
      )}
      <dl className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item, i) => (
          <div key={i}>
            <dt className="font-serif text-4xl font-medium text-neutral-900">
              {str(item.value) ?? '-'}
            </dt>
            <dd className="mt-1 text-sm text-neutral-500">{str(item.label)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ProofBar({ props }: { props: Record<string, unknown> }) {
  const items = list(props.items);
  if (items.length === 0) return null;
  return (
    <section className="border-y border-neutral-200 bg-neutral-50/60 py-8">
      <div className="container flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
        {items.map((item, i) => {
          const { url, alt } = blockImage(item);
          return (
            <div key={i} className="flex items-center gap-2 text-sm text-neutral-500">
              {url && (
                <Image
                  src={url}
                  alt={alt}
                  width={28}
                  height={28}
                  className="rounded object-cover"
                />
              )}
              {str(item.label)}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Steps({ props }: { props: Record<string, unknown> }) {
  const items = list(props.items);
  if (items.length === 0) return null;
  return (
    <section className="container py-16">
      {str(props.heading) && (
        <h2 className="font-serif text-3xl font-medium tracking-tight text-neutral-900">
          {str(props.heading)}
        </h2>
      )}
      <ol className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, i) => (
          <li key={i}>
            <span className="text-maroon font-serif text-xl italic">
              {String(i + 1).padStart(2, '0')}
            </span>
            <h3 className="mt-2 font-semibold text-neutral-900">{str(item.title)}</h3>
            {str(item.text) && (
              <p className="mt-1.5 text-sm leading-relaxed text-neutral-500">{str(item.text)}</p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function MediaBlock({ props }: { props: Record<string, unknown> }) {
  const { url, alt } = blockImage(props);
  if (!url) return null;
  const wide = props.width === 'wide';
  return (
    <section className={wide ? 'container py-10' : 'container py-10'}>
      <figure className={wide ? '' : 'max-w-2xl'}>
        <div className="relative aspect-[16/9] overflow-hidden rounded-3xl bg-neutral-100">
          <Image
            src={url}
            alt={alt}
            fill
            sizes={wide ? '100vw' : '(min-width: 768px) 42rem, 100vw'}
            className="object-cover"
          />
        </div>
        {str(props.caption) && (
          <figcaption className="mt-2 text-sm text-neutral-500">{str(props.caption)}</figcaption>
        )}
      </figure>
    </section>
  );
}

/**
 * The two collection blocks hold a QUERY, not copies of content.
 *
 * A programme published tomorrow appears in `program_grid` with nobody editing
 * the page. Storing names and prices in the block's props would be stale the
 * first time either changed, and the CMS would then have two contradictory
 * answers about what a programme costs, which is the exact failure §2.5 removed.
 */
async function ProgramGrid({ props }: { props: Record<string, unknown> }) {
  const programs = (await listPublicPrograms()).slice(0, num(props.limit, 3));
  if (programs.length === 0) return null;
  return (
    <section className="container py-16">
      {str(props.heading) && (
        <h2 className="font-serif text-3xl font-medium tracking-tight text-neutral-900">
          {str(props.heading)}
        </h2>
      )}
      <div className="mt-8">
        {programs.map((program, i) => (
          <ProgramCard
            key={program.slug}
            index={i + 1}
            slug={program.slug}
            category={program.category}
            name={program.name}
            description={program.summary ?? program.description ?? ''}
            imageUrl={program.coverUrl}
            imageAlt={program.coverAlt}
          />
        ))}
      </div>
    </section>
  );
}

async function ArticleGrid({ props }: { props: Record<string, unknown> }) {
  const { items } = await listArticles({
    perPage: num(props.limit, 3),
    category: str(props.category) ?? undefined,
  });
  if (items.length === 0) return null;
  return (
    <section className="container py-16">
      {str(props.heading) && (
        <h2 className="font-serif text-3xl font-medium tracking-tight text-neutral-900">
          {str(props.heading)}
        </h2>
      )}
      <div className="mt-8 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((article) => (
          <ArticleCard key={article.id} article={article} />
        ))}
      </div>
    </section>
  );
}

/**
 * The four types §2.6 deferred, now that §2.7 gave each of them content.
 *
 * Every one holds a query rather than copy, the decision `program_grid` set,
 * so answering an objection once updates `/faq` and every page carrying the
 * block, and publishing a mentor adds them to every grid without an edit.
 */
async function FaqAccordion({ props }: { props: Record<string, unknown> }) {
  const all = await listFaq();
  const category = str(props.category);
  const entries = (category ? all.filter((f) => f.category === category) : all).slice(
    0,
    num(props.limit, 6),
  );
  if (entries.length === 0) return null;
  return (
    <section className="container py-16">
      {str(props.heading) && (
        <h2 className="font-serif text-3xl font-medium tracking-tight text-neutral-900">
          {str(props.heading)}
        </h2>
      )}
      <div className="mt-8 max-w-3xl">
        <FaqList entries={entries} />
      </div>
    </section>
  );
}

async function TestimonialSlider({ props }: { props: Record<string, unknown> }) {
  const items = (await listTestimonials()).slice(0, num(props.limit, 3));
  if (items.length === 0) return null;
  return (
    <section className="container py-16">
      {str(props.heading) && (
        <h2 className="font-serif text-3xl font-medium tracking-tight text-neutral-900">
          {str(props.heading)}
        </h2>
      )}
      <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {items.map((t) => (
          <TestimonialQuote key={t.id} testimonial={t} />
        ))}
      </div>
    </section>
  );
}

async function MentorGrid({ props }: { props: Record<string, unknown> }) {
  const items = (await listMentors()).slice(0, num(props.limit, 4));
  if (items.length === 0) return null;
  return (
    <section className="container py-16">
      {str(props.heading) && (
        <h2 className="font-serif text-3xl font-medium tracking-tight text-neutral-900">
          {str(props.heading)}
        </h2>
      )}
      <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((m) => (
          <MentorCard key={m.id} mentor={m} />
        ))}
      </div>
    </section>
  );
}

/**
 * The form block carries only its own copy.
 *
 * Rate limiting, the honeypot and validation all live server-side, so there is
 * no prop that could weaken them, and offering one would imply there was.
 */
/**
 * `competition_calendar`, the fourteenth block type (doc 13 §9.3).
 *
 * §2.6 deferred it and §2.7 left it deferred, for one reason doc 14 §2.7
 * records: there was no `competitions` table, and "inventing one to make a page
 * look finished would create a second source of truth that Phase 3 then has to
 * reconcile". §3.4 built the table; the block cost one schema, this function,
 * and one entry in the editor's field map, exactly what §9.3 promised.
 *
 * It holds a QUERY, not a list. An editor who could pin three lomba into a
 * block would be authoring the second source of truth by hand, and it would
 * keep showing them a year after their deadlines passed, a block prop has no
 * clock, and `app.competition_phase()` is the whole point.
 */
async function CompetitionCalendarBlock({ props }: { props: Record<string, unknown> }) {
  const items = await listCompetitions({
    limit: num(props.limit, 6),
    schoolLevel: str(props.schoolLevel) ?? undefined,
  });
  if (items.length === 0) return null;

  return (
    <section className="container py-16">
      {str(props.heading) && (
        <h2 className="font-serif text-3xl font-medium tracking-tight text-neutral-900">
          {str(props.heading)}
        </h2>
      )}
      {str(props.text) && (
        <p className="mt-4 max-w-xl text-base leading-relaxed font-light text-neutral-500">
          {str(props.text)}
        </p>
      )}
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((competition) => (
          <CompetitionCard key={competition.id} competition={competition} />
        ))}
      </div>
      <Link
        href="/competitions"
        className="text-maroon mt-8 inline-flex items-center gap-1 text-sm font-semibold"
      >
        {str(props.ctaLabel) ?? 'Lihat semua lomba'} →
      </Link>
    </section>
  );
}

function ContactFormBlock({ props }: { props: Record<string, unknown> }) {
  return (
    <section className="container py-16">
      <div className="max-w-2xl">
        <ContactForm
          heading={str(props.heading) ?? undefined}
          text={str(props.text) ?? undefined}
        />
      </div>
    </section>
  );
}

type Renderer = (args: {
  props: Record<string, unknown>;
}) => React.ReactNode | Promise<React.ReactNode>;

const RENDERERS: Record<string, Renderer> = {
  hero: Hero,
  rich_text: RichText,
  cta_banner: CtaBanner,
  stat_row: StatRow,
  proof_bar: ProofBar,
  steps: Steps,
  media: MediaBlock,
  program_grid: ProgramGrid,
  article_grid: ArticleGrid,
  faq_accordion: FaqAccordion,
  testimonial_slider: TestimonialSlider,
  mentor_grid: MentorGrid,
  competition_calendar: CompetitionCalendarBlock,
  contact_form: ContactFormBlock,
};

export function BlockRenderer({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((block) => {
        const Render = RENDERERS[block.type];
        if (!Render) return null;
        return <Render key={block.id} props={block.props} />;
      })}
    </>
  );
}
