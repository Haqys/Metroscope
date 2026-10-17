import Image from 'next/image';
import Link from 'next/link';
import { Calendar, MapPin, ArrowRight } from 'lucide-react';
import { categoryLabel } from '@/lib/programs-api';

export interface ProgramCardProps {
  index: number;
  slug: string;
  category: string;
  name: string;
  description: string;
  dateVenue?: string | null;
  ctaText?: string | null;
  /** From the media library. Null while a programme has no cover yet. */
  imageUrl: string | null;
  imageAlt?: string | null;
}

/** Editorial program / event entry, numbered, magazine-style row. */
export function ProgramCard({
  index,
  slug,
  category,
  name,
  description,
  dateVenue,
  ctaText,
  imageUrl,
  imageAlt,
}: ProgramCardProps) {
  return (
    <Link
      href={`/programs/${slug}`}
      className="group grid gap-6 border-t border-neutral-200 py-10 sm:grid-cols-12 sm:items-center"
    >
      <span className="font-sans text-xl font-medium text-neutral-400 sm:col-span-1">
        {String(index).padStart(2, '0')}
      </span>

      <div className="relative aspect-[16/10] overflow-hidden rounded-3xl bg-neutral-100 sm:col-span-4">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={imageAlt ?? name}
            fill
            sizes="(min-width: 640px) 33vw, 100vw"
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
          />
        ) : (
          <div className="from-navy/10 to-maroon/10 absolute inset-0 bg-gradient-to-br" />
        )}
      </div>

      <div className="sm:col-span-7 sm:pl-4">
        <p className="text-maroon text-[11px] font-medium tracking-[0.25em] uppercase">
          {categoryLabel(category)}
        </p>

        {dateVenue && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500 font-normal">
            <span className="inline-flex items-center gap-1.5 font-medium text-neutral-700">
              <Calendar className="h-3.5 w-3.5 text-maroon" />
              {dateVenue.includes('|') ? dateVenue.split('|')[0].trim() : dateVenue}
            </span>
            {dateVenue.includes('|') && (
              <>
                <span className="text-neutral-300">•</span>
                <span className="inline-flex items-center gap-1 text-neutral-500 font-light">
                  <MapPin className="h-3.5 w-3.5 text-neutral-400" />
                  {dateVenue.split('|')[1].trim()}
                </span>
              </>
            )}
          </div>
        )}

        <h3 className="group-hover:text-maroon mt-2 font-sans text-3xl font-medium tracking-tight text-neutral-900 transition-colors sm:text-4xl">
          {name}
        </h3>
        <p className="mt-3 max-w-xl leading-relaxed font-light text-neutral-500">{description}</p>
        <span className="mt-5 inline-flex items-center text-sm font-medium text-neutral-900 group-hover:text-maroon underline-offset-4 group-hover:underline transition-colors">
          {ctaText ?? 'Read Article →'}
          <ArrowRight className="ml-1.5 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
        </span>
      </div>
    </Link>
  );
}
