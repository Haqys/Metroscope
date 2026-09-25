'use client';

/**
 * Dependency-free scroll effects for the editorial marketing pages:
 * IntersectionObserver toggles CSS classes (see globals.css) and a
 * rAF loop drives parallax/counters. GSAP-style feel, zero libraries.
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

function useInView<T extends HTMLElement>(threshold = 0.15) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  return { ref, inView };
}

/** Fade-up reveal once the element enters the viewport. */
export function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`reveal ${inView ? 'is-visible' : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/** Word-by-word masked reveal for display headings. */
export function WordReveal({
  text,
  className = '',
  step = 70,
  startDelay = 0,
}: {
  text: string;
  className?: string;
  step?: number;
  startDelay?: number;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>(0.2);
  const words = text.split(' ');
  return (
    <span ref={ref} className={`word-reveal ${inView ? 'is-visible' : ''} ${className}`}>
      {words.map((word, i) => (
        <span key={`${word}-${i}`} className="word-mask">
          <span className="word" style={{ transitionDelay: `${startDelay + i * step}ms` }}>
            {word}
            {i < words.length - 1 ? ' ' : ''}
          </span>
        </span>
      ))}
    </span>
  );
}

/** Animated count-up that starts when scrolled into view. */
export function Counter({
  to,
  suffix = '',
  prefix = '',
  decimals = 0,
  duration = 1800,
  className = '',
}: {
  to: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  duration?: number;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>(0.4);
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 4);
      setValue(to * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, duration]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {value.toFixed(decimals)}
      {suffix}
    </span>
  );
}

/** Translates children vertically relative to scroll (slower/faster layer). */
export function Parallax({
  speed = 0.2,
  className = '',
  children,
}: {
  /** Positive = moves slower than scroll (background feel). */
  speed?: number;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let raf = 0;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const offset = rect.top + rect.height / 2 - window.innerHeight / 2;
      el.style.transform = `translate3d(0, ${offset * speed}px, 0)`;
      raf = 0;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [speed]);

  return (
    <div ref={ref} className={className} style={{ willChange: 'transform' }}>
      {children}
    </div>
  );
}

/** Oversized background typography (opacity ~0.05, slow parallax). */
export function BgWord({
  word,
  className = '',
  style,
}: {
  word: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden select-none ${className}`}
    >
      <Parallax speed={0.12}>
        <span
          className="font-serif text-[24vw] leading-none font-semibold tracking-tight whitespace-nowrap uppercase opacity-[0.05] blur-[1px]"
          style={style}
        >
          {word}
        </span>
      </Parallax>
    </div>
  );
}

/** Thin reading-progress bar pinned to the top of the viewport. */
export function ScrollProgress() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? window.scrollY / max : 0;
      el.style.transform = `scaleX(${p})`;
      raf = 0;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="fixed inset-x-0 top-0 z-[60] h-[3px]">
      <div ref={ref} className="bg-maroon h-full origin-left scale-x-0" />
    </div>
  );
}
