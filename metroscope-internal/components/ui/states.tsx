import { cn } from '@/lib/utils';

/** Skeleton placeholder that mirrors the shape of the content it replaces. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('bg-muted animate-pulse rounded-md', className)} />;
}

/**
 * Empty state. Always name what is missing and offer the next action,
 * never render a bare "no data".
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="border-border flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-14 text-center">
      <p className="text-sm font-semibold">{title}</p>
      {description ? (
        <p className="text-muted-foreground mt-1 max-w-sm text-sm">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Error state. Say what failed and what the user can do, never leak internals. */
export function ErrorState({
  title = 'Terjadi kesalahan',
  description = 'Silakan coba lagi. Jika masalah berlanjut, hubungi tim.',
  action,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="border-destructive/30 bg-destructive/5 rounded-lg border px-6 py-10 text-center">
      <p className="text-destructive text-sm font-semibold">{title}</p>
      <p className="text-muted-foreground mt-1 text-sm">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
