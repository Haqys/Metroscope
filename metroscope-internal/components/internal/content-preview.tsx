import { ImageIcon } from 'lucide-react';

export interface ContentPreviewData {
  title: string;
  body: string;
  author: string;
  authorRole: string;
  submittedAt: string;
  mediaUrl?: string;
}

/** Read-only preview of a submitted content item (wireframe: Input Form 6/7). */
export function ContentPreview({ content }: { content: ContentPreviewData }) {
  return (
    <div className="rounded-2xl border border-neutral-200/70 bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
      <h2 className="text-base font-semibold tracking-tight text-neutral-900">Preview Konten</h2>

      {/* Media */}
      <div className="mt-4 flex aspect-[16/9] items-center justify-center rounded-xl border border-neutral-200/70 bg-neutral-50">
        {content.mediaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={content.mediaUrl} alt="" className="h-full w-full rounded-xl object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-neutral-300">
            <ImageIcon className="h-8 w-8" />
            <span className="text-xs">Tidak ada media</span>
          </div>
        )}
      </div>

      {/* Body */}
      <h3 className="mt-5 text-base font-semibold text-neutral-900">{content.title}</h3>
      <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-neutral-600">
        {content.body}
      </p>

      <p className="mt-5 border-t border-neutral-100 pt-4 text-xs text-neutral-400">
        Diajukan oleh: {content.author} ({content.authorRole}) · {content.submittedAt}
      </p>
    </div>
  );
}
