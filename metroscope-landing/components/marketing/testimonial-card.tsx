export interface TestimonialCardProps {
  quote: string;
  name: string;
}

/** Testimonial card: dark panel, name + quote. */
export function TestimonialCard({ quote, name }: TestimonialCardProps) {
  return (
    <div className="flex flex-col items-center gap-0 px-2">
      <div className="w-full rounded-2xl bg-neutral-900 p-8 shadow-xl sm:p-10">
        <h3 className="text-xl font-semibold text-white">{name}</h3>
        <p className="mt-4 text-sm leading-relaxed font-light text-neutral-300">
          &ldquo;{quote}&rdquo;
        </p>
      </div>
    </div>
  );
}
