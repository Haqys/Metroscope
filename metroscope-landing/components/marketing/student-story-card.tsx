import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, GraduationCap, Award } from 'lucide-react';

export interface StudentStoryCardProps {
  slug: string;
  name: string;
  role: string;
  education: string;
  program: string;
  quote: string;
  imageUrl: string;
}

export function StudentStoryCard({ slug, name, role, education, program, quote, imageUrl }: StudentStoryCardProps) {
  return (
    <div className="flex h-full flex-col justify-between rounded-3xl border border-neutral-100 bg-white p-8 shadow-sm transition-all hover:shadow-md">
      <div>
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-6">
          <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl shadow-sm">
            <Image src={imageUrl} alt={`Foto ${name}`} fill sizes="112px" className="object-cover" />
          </div>
          <div>
            <h3 className="font-serif text-2xl font-semibold text-neutral-900">{name}</h3>
            <p className="text-sm font-medium text-maroon mt-1">{role}</p>
          </div>
        </div>

        <div className="mb-6 space-y-2">
          <div className="flex items-center gap-2 text-sm text-neutral-600">
            <GraduationCap className="h-4 w-4 shrink-0 text-neutral-400" />
            <span>{education}</span>
          </div>
          <div className="flex items-start gap-2 text-sm text-neutral-600">
            <Award className="h-4 w-4 shrink-0 mt-0.5 text-neutral-400" />
            <span className="leading-tight">{program}</span>
          </div>
        </div>

        <blockquote className="mb-8 text-neutral-600 font-light italic leading-relaxed">
          {quote}
        </blockquote>
      </div>

      <Link
        href={`/showcase/${slug}`}
        className="group inline-flex w-fit items-center gap-2 rounded-full border border-neutral-200 px-5 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-maroon hover:bg-maroon hover:text-white"
      >
        View More
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </Link>
    </div>
  );
}
