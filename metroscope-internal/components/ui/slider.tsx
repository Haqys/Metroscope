'use client';

import { cn } from '@/lib/utils';

interface SliderProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Text shown on the right, defaults to `${value}%`. */
  valueLabel?: string;
  className?: string;
}

/**
 * Labelled range slider with a filled track, used for per-topic progress and
 * assessment criteria scoring. Native `<input type=range>` for accessibility,
 * restyled via a gradient track so the fill follows the thumb.
 */
export function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  valueLabel,
  className,
}: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className={cn('block', className)}>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm font-medium text-neutral-800">{label}</span>
        <span className="text-navy text-sm font-semibold">{valueLabel ?? `${value}%`}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="ms-range focus-visible:ring-navy/25 mt-2 h-2 w-full cursor-pointer appearance-none rounded-full focus:outline-none focus-visible:ring-2"
        style={{
          background: `linear-gradient(to right, #192e5f 0%, #192e5f ${pct}%, #f5f5f5 ${pct}%, #f5f5f5 100%)`,
        }}
      />
    </div>
  );
}
