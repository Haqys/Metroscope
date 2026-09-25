'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/states';
import { logger } from '@/lib/logger';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error('unhandled_route_error', { digest: error.digest, message: error.message });
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg items-center px-6">
      <ErrorState action={<Button onClick={reset}>Coba lagi</Button>} />
    </main>
  );
}
