/** Mentor's qualitative note under the topic bars (FR-PRG-2). */
export function MentorNote({ note, mentor }: { note: string; mentor?: string }) {
  return (
    <div className="rounded-xl bg-neutral-50 p-5 ring-1 ring-neutral-100">
      <p className="text-xs font-semibold tracking-wider text-neutral-400 uppercase">
        Catatan Mentor{mentor ? `, ${mentor}` : ''}
      </p>
      <blockquote className="mt-2 font-serif text-lg leading-relaxed text-neutral-700 italic">
        &ldquo;{note}&rdquo;
      </blockquote>
    </div>
  );
}
