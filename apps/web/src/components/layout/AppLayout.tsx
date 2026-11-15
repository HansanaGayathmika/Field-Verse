import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'motion/react';
import { Menu, User, X } from 'lucide-react';
import { useFarm } from '@/contexts/FarmContext';
import { useSession } from '@/hooks/queries';
import { Logo } from './Logo';
import { Preferences } from './Preferences';
import { CornerAstronaut } from '@/features/mascot/CornerAstronaut';

/** Pages with their own big mascot (home, log in, sign up) skip the corner farmer; every other page has it. */
const OWN_MASCOT_PAGES = /^\/(login|register)?$/;
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Top navigation. Rotation Lab, Roots, Climate, Gap Finder and Data are reached from My Farm's tool links and the footer. */
/**
 * Sections that use the 'Fresh Pine' app theme (see styles/index.css): Explore (+ farm details step),
 * My Farm (+ its tools), My Plan and Community. Other pages keep the original palette.
 */
const THEMED_SECTIONS = /^\/(explore|setup|farm|rotations|roots|climate|gaps|plan|community)(\/|$)/;

/** `match`: every page that belongs to the section, so its tab stays lit (e.g. My Farm for all the farm tools). */
const NAV = [
  { to: '/explore', key: 'explore', match: /^\/explore(\/|$)/ },
  { to: '/farm', key: 'farm', match: /^\/(farm|setup|rotations|roots|climate|gaps)(\/|$)/ },
  { to: '/plan', key: 'plan', match: /^\/(plan|saved)(\/|$)/ },
  { to: '/community', key: 'community', match: /^\/community(\/|$)/ },
] as const;

export function AppLayout() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { farm } = useFarm();
  const session = useSession();
  const isLanding = location.pathname === '/';
  const themed = THEMED_SECTIONS.test(location.pathname);
  /** Dark navbar with white text: home page (see-through) and the app sections (solid #124B35). */
  const darkNav = isLanding || themed;

  // On <html> so dialogs and popovers (rendered outside the page tree) use the same theme.
  useEffect(() => {
    document.documentElement.classList.toggle('fv-theme-app', themed);
    return () => document.documentElement.classList.remove('fv-theme-app');
  }, [themed]);
  const authed = !!session.data?.authenticated;

  useEffect(() => {
    setOpen(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-[2000] rounded bg-gold-500 px-4 py-2 font-semibold text-forest-900 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {t('app.skip')}
      </a>
      <header
        className={cn(
          'no-print sticky top-0 z-[900] border-b',
          isLanding
            ? 'border-white/10 bg-forest-950/40 backdrop-blur-md'
            : themed
              ? 'border-white/10 bg-[#124B35]'
              : 'border-forest-900/10 bg-cream-50/95 backdrop-blur',
        )}
      >
        <div className="flex h-[72px] w-full items-center gap-3 px-4 sm:px-6 lg:px-10">
          <Link to="/" className="flex items-center gap-2" aria-label="FieldVerse home">
            <Logo light={darkNav} />
          </Link>
          {!authed ? (
            /* Logged-out visitors: only Log in / Sign up. Features unlock after login. */
            <div className="ml-auto flex items-center gap-1 sm:gap-2" data-testid="guest-nav">
              <Link
                to="/login"
                className={cn(
                  'flex h-11 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-base font-semibold sm:px-4',
                  darkNav ? 'text-white hover:bg-white/10' : 'text-forest-900 hover:bg-forest-900/5',
                )}
              >
                <User className="hidden size-4 sm:block" aria-hidden /> {t('nav.login')}
              </Link>
              <Link to="/register" className={cn(buttonVariants({ variant: 'gold', size: 'sm' }), 'h-11 px-4 text-base sm:px-5')}>
                {t('nav.signup')}
              </Link>
            </div>
          ) : (
            <>
              <nav
                aria-label="Main"
                // Home page: the four links sit closer together in the middle; app pages: spread across the bar.
                className={cn('hidden flex-1 items-center xl:flex', isLanding ? 'justify-center gap-4' : 'justify-between px-[7vw]')}
              >
                {NAV.map((n) => {
                  const isActive = n.match.test(location.pathname);
                  return (
                  <Link
                    key={n.to}
                    to={n.to}
                    aria-current={isActive ? 'page' : undefined}
                    className={
                      cn(
                        'whitespace-nowrap rounded-full px-5 py-2.5 text-base font-semibold outline-none ring-1 ring-transparent transition duration-300 ease-out hover:-translate-y-0.5 hover:scale-110 focus-visible:-translate-y-0.5 focus-visible:scale-110 motion-reduce:transform-none',
                        darkNav
                          ? 'hover:bg-gold-500/10 hover:ring-gold-500/70 hover:shadow-[0_0_22px_rgb(214_172_96/0.45)] focus-visible:ring-gold-500/70 focus-visible:shadow-[0_0_22px_rgb(214_172_96/0.45)]'
                          : 'hover:ring-emerald-500/60 hover:shadow-[0_0_20px_rgb(30_154_113/0.35)] focus-visible:ring-emerald-500/60 focus-visible:shadow-[0_0_20px_rgb(30_154_113/0.35)]',
                        darkNav ? 'text-white/90 hover:bg-white/10 hover:text-white' : 'text-forest-800 hover:bg-forest-900/5',
                        // Current section: a solid, clearly different pill (not just a faint tint).
                        isActive &&
                          (darkNav
                            ? 'bg-white text-[#124B35] shadow-[0_4px_14px_rgb(0_0_0/0.25)] ring-2 ring-[#ffd34d] hover:bg-white hover:text-[#124B35]'
                            : 'bg-emerald-600 text-white shadow-md hover:bg-emerald-600'),
                      )
                    }
                  >
                    {t(`nav.${n.key}`)}
                  </Link>
                  );
                })}
              </nav>
              <div className="ml-auto flex items-center gap-1">
                {farm ? (
                  <span
                    className={cn(
                      'hidden max-w-56 truncate rounded-full px-3 py-1.5 text-sm font-semibold md:inline',
                      darkNav ? 'bg-white/10 text-white' : 'bg-sage-100 text-forest-900',
                    )}
                  >
                    {farm.farmName}
                  </span>
                ) : null}
                <Link
                  to={session.data?.authenticated ? '/account' : '/login'}
                  className={cn(
                    'hidden h-11 items-center gap-1.5 rounded-full px-4 text-base font-semibold sm:flex',
                    darkNav ? 'text-white hover:bg-white/10' : 'text-forest-900 hover:bg-forest-900/5',
                  )}
                >
                  <User className="size-4" aria-hidden /> {session.data?.authenticated ? t('nav.account') : t('nav.login')}
                </Link>
                <button
                  className={cn(
                    'grid size-11 cursor-pointer place-items-center rounded-full xl:hidden',
                    darkNav ? 'text-white hover:bg-white/10' : 'text-forest-900 hover:bg-forest-900/5',
                  )}
                  aria-label={open ? t('nav.close') : t('nav.menu')}
                  aria-expanded={open}
                  aria-controls="mobile-nav"
                  onClick={() => setOpen((v) => !v)}
                >
                  {open ? <X /> : <Menu />}
                </button>
              </div>
            </>
          )}
        </div>
        <AnimatePresence>
          {open && authed ? (
            <motion.nav
              id="mobile-nav"
              aria-label="Main"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-white/10 bg-forest-900 xl:hidden"
            >
              <ul className="grid gap-1 p-4 sm:grid-cols-2">
                {NAV.map((n) => (
                  <li key={n.to}>
                    <Link
                      to={n.to}
                      aria-current={n.match.test(location.pathname) ? 'page' : undefined}
                      className={
                        cn('block rounded-xl px-4 py-3 font-semibold text-cream-50', n.match.test(location.pathname) ? 'bg-emerald-600 ring-2 ring-[#ffd34d]' : 'hover:bg-white/10')
                      }
                    >
                      {t(`nav.${n.key}`)}
                    </Link>
                  </li>
                ))}
                <li>
                  <NavLink
                    to={session.data?.authenticated ? '/account' : '/login'}
                    className="block rounded-xl px-4 py-3 font-semibold text-cream-50 hover:bg-white/10"
                  >
                    {session.data?.authenticated ? t('nav.account') : t('nav.login')}
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/saved" className="block rounded-xl px-4 py-3 font-semibold text-cream-50 hover:bg-white/10">
                    {t('nav.saved')}
                  </NavLink>
                </li>
              </ul>
              <div className="border-t border-white/10 p-4">
                <Preferences dark />
              </div>
            </motion.nav>
          ) : null}
        </AnimatePresence>
      </header>

      <main id="main" className="flex-1" tabIndex={-1}>
        <Outlet />
      </main>

      {/* No footer in the app sections (Explore, My Farm + tools, My Plan, Community): the gradient runs to the bottom */}
      {themed ? null : <Footer authed={authed} flush={isLanding} credits={!isLanding} />}
      {OWN_MASCOT_PAGES.test(location.pathname) ? null : <CornerAstronaut />}
    </div>
  );
}

/** credits: data/imagery attribution line. Hidden on the home page, which shows no map, NASA imagery or soil data. */
function Footer({ authed, flush = false, credits = true }: { authed: boolean; flush?: boolean; credits?: boolean }) {
  return (
    <footer className={cn('no-print bg-forest-950 text-cream-50/80', !flush && 'mt-16')}>
      {/* FieldVerse in the left corner, Privacy in the right corner, About and Data evenly between */}
      <div className="grid gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:flex lg:justify-between lg:gap-16 lg:px-10">
        <div className="space-y-3 lg:max-w-xs">
          <Logo light />
          <p className="text-base">One Farm. Three Futures. Better Decisions.</p>
          <p className="text-sm text-cream-50/60">Built for the NASA Space Apps Challenge 2026. Not an official NASA product.</p>
        </div>
        <div>
          <h2 className="mb-4 font-sans text-base font-bold uppercase tracking-wide text-gold-500">About</h2>
          <ul className="space-y-3 text-base">
            <li>
              <Link className="hover:text-white" to="/#how">
                How it works
              </Link>
            </li>
            {authed ? (
              <>
                <li>
                  <Link className="hover:text-white" to="/explore">
                    Demo regions
                  </Link>
                </li>
                <li>
                  <Link className="hover:text-white" to="/saved">
                    Saved plans
                  </Link>
                </li>
              </>
            ) : (
              <>
                <li>
                  <Link className="hover:text-white" to="/login">
                    Log in
                  </Link>
                </li>
                <li>
                  <Link className="hover:text-white" to="/register">
                    Sign up
                  </Link>
                </li>
              </>
            )}
          </ul>
        </div>
        <div>
          <h2 className="mb-4 font-sans text-base font-bold uppercase tracking-wide text-gold-500">Data</h2>
          <ul className="space-y-3 text-base">
            {authed ? (
              <li>
                <Link className="hover:text-white" to="/data">
                  Data sources &amp; status
                </Link>
              </li>
            ) : null}
            <li>
              <a className="hover:text-white" href="https://power.larc.nasa.gov/" target="_blank" rel="noreferrer">
                NASA POWER
              </a>
            </li>
            <li>
              <a
                className="hover:text-white"
                href="https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api"
                target="_blank"
                rel="noreferrer"
              >
                NASA GIBS
              </a>
            </li>
            <li>
              <a className="hover:text-white" href="https://soilgrids.org/" target="_blank" rel="noreferrer">
                ISRIC SoilGrids
              </a>
            </li>
          </ul>
        </div>
        <div className="lg:max-w-sm">
          <h2 className="mb-4 font-sans text-base font-bold uppercase tracking-wide text-gold-500">Privacy</h2>
          <p className="text-base leading-relaxed">
            Your farm details are kept in this browser and, if you choose to save them, privately in your account. Your field location is never shown to other
            people.
          </p>
          {authed ? (
            <Link className="mt-3 inline-block text-base underline hover:text-white" to="/data#privacy">
              Privacy details
            </Link>
          ) : null}
        </div>
      </div>
      {credits ? (
        <div className="border-t border-white/10 px-4 py-5 text-center text-sm text-cream-50/60">
          Map data © OpenStreetMap contributors · Imagery courtesy NASA GIBS / ESDIS · Soil data © ISRIC (CC-BY 4.0)
        </div>
      ) : null}
    </footer>
  );
}
