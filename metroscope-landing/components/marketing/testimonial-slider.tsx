'use client';

import { useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';

import { TestimonialCard, type TestimonialCardProps } from './testimonial-card';

export function TestimonialSlider({ items }: { items: TestimonialCardProps[] }) {
  const [index, setIndex] = useState(0);
  const prev = () => setIndex((i) => (i - 1 + items.length) % items.length);
  const next = () => setIndex((i) => (i + 1) % items.length);

  return (
    <div>
      <div className="overflow-hidden">
        <div
          className="flex transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {items.map((item) => (
            <div key={item.name} className="w-full shrink-0 py-2 sm:px-6" aria-hidden={false}>
              <div className="mx-auto max-w-2xl">
                <TestimonialCard {...item} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Controls, navy accents */}
      <div className="mt-10 flex items-center justify-center gap-6">
        <button
          type="button"
          onClick={prev}
          aria-label="Testimoni sebelumnya"
          className="border-navy/30 text-navy hover:bg-navy flex h-11 w-11 items-center justify-center rounded-full border transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="flex gap-2" role="tablist" aria-label="Pilih testimoni">
          {items.map((item, i) => (
            <button
              key={item.name}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Testimoni ${item.name}`}
              onClick={() => setIndex(i)}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === index ? 'bg-navy w-8' : 'hover:bg-navy/40 w-2 bg-neutral-300'
              }`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={next}
          aria-label="Testimoni berikutnya"
          className="border-navy/30 text-navy hover:bg-navy flex h-11 w-11 items-center justify-center rounded-full border transition-colors hover:text-white"
        >
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
