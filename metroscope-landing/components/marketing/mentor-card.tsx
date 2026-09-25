import Image from 'next/image';
import Link from 'next/link';

import type { Mentor } from '@/lib/surfaces-api';

/**
 * A mentor, from `mentor_profiles`, never from `users`.
 *
 * Everything shown here is copy a mentor agreed to publish. The account behind
 * the profile is not part of the payload at all, so there is no private field
 * to leak by accident (doc 14 §2.7).
 */
export function MentorCard({ mentor }: { mentor: Mentor }) {
  return (
    <article className="group">
      <Link href={`/mentors/${mentor.slug}`} className="block">
        <div className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-neutral-100">
          {mentor.photoUrl ? (
            <Image
              src={mentor.photoUrl}
              alt={mentor.photoAlt ?? ''}
              fill
              sizes="(min-width: 1024px) 25vw, 50vw"
              className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
            />
          ) : (
            <div className="from-navy/10 to-maroon/10 absolute inset-0 bg-gradient-to-br" />
          )}
        </div>
        <h3 className="group-hover:text-maroon mt-4 font-serif text-xl font-medium text-neutral-900 transition-colors">
          {mentor.displayName}
        </h3>
        {mentor.headline && (
          <p className="mt-1 text-sm leading-relaxed text-neutral-500">{mentor.headline}</p>
        )}
        {mentor.specialisms.length > 0 && (
          <p className="text-maroon mt-2 text-xs font-medium tracking-wider uppercase">
            {mentor.specialisms.join(' · ')}
          </p>
        )}
      </Link>
    </article>
  );
}
