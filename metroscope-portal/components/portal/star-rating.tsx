import { Star } from 'lucide-react';

/**
 * Fractional star rating on a /max scale (default /10), drawn with 5 stars.
 * e.g. value=8.1, max=10 → 81% filled (4.05 of 5 stars).
 */
export function StarRating({
  value,
  max = 10,
  size = 'h-5 w-5',
  className = '',
}: {
  value: number;
  max?: number;
  size?: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const stars = [0, 1, 2, 3, 4];

  return (
    <span
      className={`relative inline-flex ${className}`}
      role="img"
      aria-label={`${value} dari ${max} bintang`}
    >
      <span className="flex gap-0.5 text-neutral-200">
        {stars.map((i) => (
          <Star key={i} className={`${size} fill-current`} />
        ))}
      </span>
      <span
        className="absolute inset-0 flex gap-0.5 overflow-hidden text-amber-400"
        style={{ width: `${pct}%` }}
        aria-hidden
      >
        {stars.map((i) => (
          <Star key={i} className={`${size} shrink-0 fill-current`} />
        ))}
      </span>
    </span>
  );
}
