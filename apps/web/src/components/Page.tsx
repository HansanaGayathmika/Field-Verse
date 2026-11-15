import type { ReactNode } from 'react';
import { Link, NavLink, Navigate, useLocation } from 'react-router';
import { useSession } from '@/hooks/queries';
import { LoadingBlock } from '@/components/StatusStates';
import { MapPinned, Sprout } from 'lucide-react';
import { useFarm } from '@/contexts/FarmContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10', className)}>{children}</div>;
}

export function PageHeader({
  eyebrow,
  title,
  intro,
  actions,
  titleClassName,
}: {
  eyebrow?: string;
  title: string;
  intro?: ReactNode;
  actions?: ReactNode;
  /** Optional size override for the title (e.g. the farm name on My Farm). */
  titleClassName?: string;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-3xl">
        {eyebrow ? <p className="mb-2 text-sm font-bold uppercase tracking-wider text-emerald-700">{eyebrow}</p> : null}
        <h1 className={cn('text-3xl sm:text-4xl', titleClassName)}>{title}</h1>
        {intro ? <div className="mt-3 text-lg text-ink-muted">{intro}</div> : null}
      </div>
      {actions ? <div className="no-print flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

/**
 * App features require an account. Logged-out visitors are sent to the login page;
 * after logging in they return to the home page with the full navigation.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const session = useSession();
  const location = useLocation();
  if (session.isLoading) {
    return (
      <PageContainer>
        <LoadingBlock rows={2} />
      </PageContainer>
    );
  }
  if (!session.data?.authenticated) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

/** Pages that need a farm profile show a friendly start prompt instead of an error. */
export function RequireFarm({ children }: { children: ReactNode }) {
  const { farm } = useFarm();
  if (farm) return <>{children}</>;
  return (
    <PageContainer>
      <div className="mx-auto max-w-xl rounded-3xl border border-forest-900/10 bg-white p-8 text-center shadow-[var(--shadow-card)]">
        <Sprout className="mx-auto size-12 text-emerald-600" aria-hidden />
        <h1 className="mt-4 text-2xl">First, tell us about a farm</h1>
        <p className="mt-2 text-ink-muted">Choose a demo region and describe a field. It takes about a minute, and no sign-up is needed.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/explore">
              <MapPinned aria-hidden /> Choose a region
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link to="/explore?demo=1">Try the demo</Link>
          </Button>
        </div>
      </div>
    </PageContainer>
  );
}

export function FarmSubnav() {
  const items = [
    { to: '/farm', label: 'My Farm' },
    { to: '/rotations', label: 'Rotation Lab' },
    { to: '/climate', label: 'Climate Time Machine' },
    { to: '/roots', label: 'Roots of Tomorrow' },
    { to: '/gaps', label: 'Gap Finder' },
    { to: '/plan', label: 'My Plan' },
  ];
  return (
    <nav aria-label="Farm tools" className="no-print -mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-2">
        {items.map((i) => (
          <li key={i.to}>
            {/* NavLink marks the page you are on (also its sub-pages, e.g. one option in Rotation Lab). */}
            <NavLink
              to={i.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition',
                  isActive
                    ? 'border-transparent bg-gradient-to-r from-emerald-600 to-[#11806f] text-white shadow-md ring-2 ring-[#ffd34d]/80'
                    : 'border-forest-900/15 bg-white/85 text-forest-900 hover:-translate-y-0.5 hover:border-emerald-600 hover:text-emerald-700',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive ? <span className="size-2 rounded-full bg-[#ffd34d]" aria-hidden /> : null}
                  {i.label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
