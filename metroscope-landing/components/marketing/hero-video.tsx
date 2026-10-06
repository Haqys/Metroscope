'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Play, X } from 'lucide-react';

const VIDEO_ID = 'yghR5EavedM';
const VIDEO_TITLE = 'Video profil Metroscope';

/** Hero "watch video" button + fullscreen YouTube popup. */
export function HeroVideo() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  // Escape closes; lock page scroll while the popup is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, close]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex items-center gap-4 text-white"
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-full border border-white/40 backdrop-blur-sm transition-all duration-300 group-hover:scale-110 group-hover:border-white group-hover:bg-white/10">
          <Play className="ml-0.5 h-5 w-5 fill-white" />
        </span>
        <span className="text-sm font-medium tracking-wide text-white/90 transition-colors group-hover:text-white">
          Watch Video
        </span>
      </button>

      {/* Portal escapes transformed ancestors (Reveal uses will-change:
          transform, which would trap position:fixed inside it). */}
      {open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={VIDEO_TITLE}
            className="fixed inset-0 z-[80] flex flex-col bg-black"
          >
            {/* Video fills the screen, centered; tapping the empty area closes */}
            <div className="flex min-h-0 flex-1 items-center justify-center" onClick={close}>
              <div
                className="aspect-video max-h-full w-full sm:max-w-6xl"
                onClick={(e) => e.stopPropagation()}
              >
                <iframe
                  width="100%"
                  height="100%"
                  src={`https://www.youtube.com/embed/${VIDEO_ID}?autoplay=1&rel=0`}
                  title={VIDEO_TITLE}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                  className="h-full w-full border-0"
                />
              </div>
            </div>

            {/* Bottom-center close, easy thumb reach on mobile */}
            <div className="flex shrink-0 justify-center pt-4 pb-[max(1.75rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={close}
                className="flex items-center gap-2.5 rounded-full border border-white/30 px-8 py-3.5 text-sm font-medium tracking-wide text-white transition-colors hover:bg-white hover:text-black"
              >
                <X className="h-4 w-4" />
                Close Video
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
