import Image from 'next/image';
import Link from 'next/link';
import { categoryLabel } from '@/lib/programs-api';

export interface ProgramCardProps {
  index: number;
  slug: string;
  category: string;
  name: string;
  description: string;
  /** From the media library. Null while a programme has no cover yet. */
  imageUrl: string | null;
  imageAlt?: string | null;
}

/** Editorial program entry, numbered, magazine-style row. */
export function ProgramCard({
  index,
  slug,
  category,
  name,
  description,
  imageUrl,
  imageAlt,
}: ProgramCardProps) {
  return (
    <Link
      href={`/programs/${slug}`}
      className="group grid gap-6 border-t border-neutral-200 py-10 sm:grid-cols-12 sm:items-center"
    >
      <span className="font-serif text-xl text-neutral-400 italic sm:col-span-1">
        {String(index).padStart(2, '0')}
      </span>

      {/*
        A programme without a cover renders a tinted panel, not a broken image.
        The CMS does not require one, so the card must not assume one, an
        editor adding a programme at 11pm should get a usable page.

        `alt` comes from the media library rather than falling back to the
        programme name: the library's alt text describes the picture, and a name
        repeated from the heading beside it is noise to a screen reader.
      */}
      <div className="relative aspect-[16/10] overflow-hidden rounded-3xl bg-neutral-100 sm:col-span-4">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={imageAlt ?? ''}
            fill
            sizes="(min-width: 640px) 33vw, 100vw"
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
          />
        ) : (
          <div className="from-navy/10 to-maroon/10 absolute inset-0 bg-gradient-to-br" />
        )}
      </div>

      <div className="sm:col-span-7 sm:pl-4">
        <p className="text-maroon text-[11px] font-medium tracking-[0.3em] uppercase">
          {categoryLabel(category)}
        </p>
        <h3 className="group-hover:text-maroon mt-2 font-serif text-3xl font-medium tracking-tight text-neutral-900 transition-colors sm:text-4xl">
          {name}
        </h3>
        <p className="mt-3 max-w-lg leading-relaxed font-light text-neutral-500">{description}</p>
        <span className="mt-5 inline-block text-sm font-medium text-neutral-900 underline-offset-4 group-hover:underline">
          Lihat detail program →
        </span>
      </div>
    </Link>
  );
}
