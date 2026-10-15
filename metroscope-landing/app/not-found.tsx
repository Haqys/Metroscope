import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg items-center px-6">
      <EmptyState
        title="Page not found"
        description="The link may have changed or been removed."
        action={
          <Button asChild>
            <Link href="/">Back to home</Link>
          </Button>
        }
      />
    </main>
  );
}
