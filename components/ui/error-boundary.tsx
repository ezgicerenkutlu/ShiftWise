'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/states';

export function GlobalErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-8">
      <div className="max-w-md text-center">
        <ErrorState
          title="Application error"
          description={error.message || 'An unexpected error occurred.'}
        />
        <Button onClick={reset} className="mt-4" variant="outline">
          Try again
        </Button>
      </div>
    </div>
  );
}
