import Image from 'next/image';
import { Star } from 'lucide-react';

export interface TestimonialCardProps {
  quote: string;
  name: string; // e.g. "Bunda Rani"
  role: string; // e.g. "Orang Tua Siswa · Olimpiade Sains"
  rating: number; // 1–5
  imageUrl: string;
}

/** Photo-left testimonial card: dark panel, gold stars, name + role + quote. */
export function TestimonialCard({ quote, name, role, rating, imageUrl }: TestimonialCardProps) {
  return (
    <div className="flex flex-col items-center gap-0 px-2 sm:flex-row">
      <div className="relative z-10 -mb-10 h-44 w-44 shrink-0 overflow-hidden rounded-2xl shadow-lg sm:-mr-10 sm:mb-0 sm:h-56 sm:w-48">
        <Image src={imageUrl} alt={`Foto ${name}`} fill sizes="192px" className="object-cover" />
      </div>

      <div className="flex-1 rounded-2xl bg-neutral-900 px-8 pt-16 pb-8 shadow-xl sm:py-9 sm:pr-9 sm:pl-16">
        <div className="flex gap-1" aria-label={`Rating ${rating} dari 5`}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={`h-4 w-4 ${
                i < rating ? 'fill-amber-400 text-amber-400' : 'fill-neutral-700 text-neutral-700'
              }`}
            />
          ))}
        </div>
        <h3 className="mt-3 text-xl font-semibold text-white">{name}</h3>
        <p className="mt-0.5 text-sm text-neutral-400">{role}</p>
        <p className="mt-4 text-sm leading-relaxed font-light text-neutral-300">
          &ldquo;{quote}&rdquo;
        </p>
      </div>
    </div>
  );
}
