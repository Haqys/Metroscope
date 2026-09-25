import Image from 'next/image';
import Link from 'next/link';
import { Quote } from 'lucide-react';

import type { Testimonial } from '@/lib/surfaces-api';

/**
 * One parent testimonial, from the CMS.
 *
 * The consent record behind it is deliberately absent from the payload this
 * renders. It proves permission internally and would expose how the business
 * contacts its families if published. See `surfaces.service.ts`.
 */
export function TestimonialQuote({ testimonial }: { testimonial: Testimonial }) {
  return (
    <figure className="flex h-full flex-col rounded-3xl border border-neutral-200 bg-white p-6">
      <Quote className="text-maroon/30 h-7 w-7" aria-hidden />
      <blockquote className="mt-4 flex-1 leading-[1.75] text-neutral-700">
        {testimonial.quote}
      </blockquote>

      <figcaption className="mt-6 flex items-center gap-3 border-t border-neutral-100 pt-5">
        {testimonial.photoUrl ? (
          <Image
            src={testimonial.photoUrl}
            alt={testimonial.photoAlt ?? ''}
            width={44}
            height={44}
            className="h-11 w-11 rounded-full object-cover"
          />
        ) : (
          <span className="bg-navy/10 text-navy flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold">
            {testimonial.authorName.slice(0, 1)}
          </span>
        )}
        <div className="min-w-0">
          <p className="font-medium text-neutral-900">{testimonial.authorName}</p>
          <p className="truncate text-xs text-neutral-500">
            {testimonial.authorRole}
            {testimonial.programSlug && testimonial.programName && (
              <>
                {testimonial.authorRole ? ' · ' : ''}
                <Link
                  href={`/programs/${testimonial.programSlug}`}
                  className="hover:text-navy underline-offset-2 hover:underline"
                >
                  {testimonial.programName}
                </Link>
              </>
            )}
          </p>
        </div>
      </figcaption>
    </figure>
  );
}
