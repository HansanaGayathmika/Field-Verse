import { Link } from 'react-router';
import { Sprout } from 'lucide-react';
import { PageContainer } from '@/components/Page';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <PageContainer className="max-w-xl py-20 text-center">
      <Sprout className="mx-auto size-14 text-sage-400" aria-hidden />
      <h1 className="mt-4 text-3xl">This page has not grown yet</h1>
      <p className="mt-2 text-ink-muted">The link may be wrong or the page may have moved.</p>
      <Button asChild className="mt-6">
        <Link to="/">Go to the home page</Link>
      </Button>
    </PageContainer>
  );
}
