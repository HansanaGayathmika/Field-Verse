import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { MotionConfig, motion } from 'motion/react';
import { ArrowRight, CloudSun, Info, MapPinned, Satellite, Scale, Sprout, ShieldCheck, ThermometerSun, User, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSession } from '@/hooks/queries';
import { cn } from '@/lib/utils';
import { usePreferences } from '@/contexts/PreferencesContext';
import { ProvenanceBadge } from '@/components/Provenance';
import { HeroMascot } from '@/features/mascot/HeroMascot';

/**
 * Home page background: the FieldVerse intro animation (assets/gemini_generated_video_13742e39.mp4,
 * re-encoded without audio into public/media/home/). It sits behind every home-page section and
 * stays in view while scrolling; the layer ends where the footer starts.
 * Low-bandwidth mode shows the still poster; calm / reduced motion pauses the video.
 */
function PageBackgroundVideo() {
  const { lowBandwidth, calmMotion } = usePreferences();
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!calmMotion) ref.current?.play().catch(() => undefined);
    else ref.current?.pause();
  }, [calmMotion]);
  const poster = '/media/home/field-verse-home-poster.jpg';
  return (
    <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden data-testid="home-background-video">
      <div className="sticky top-0 h-[100lvh] w-full overflow-hidden bg-forest-950">
        {lowBandwidth ? (
          <img src={poster} alt="" className="size-full object-cover" />
        ) : (
          <video
            ref={ref}
            className="size-full object-cover"
            poster={poster}
            muted
            loop
            playsInline
            autoPlay={!calmMotion}
            preload="auto"
            disablePictureInPicture
            tabIndex={-1}
          >
            <source src="/media/home/field-verse-home.webm" type="video/webm" />
            <source src="/media/home/field-verse-home.mp4" type="video/mp4" />
          </video>
        )}
        {/* Dark wash so text and cards stay readable over the moving picture */}
        <div className="absolute inset-0 bg-gradient-to-b from-forest-950/65 via-forest-950/55 to-forest-950/75" />
      </div>
    </div>
  );
}

/** See-through "frosted glass" card used on every home-page section (the video shows through). */
const GLASS = 'rounded-3xl bg-white/[0.08] ring-1 ring-white/15 backdrop-blur-md';
/** Hover: the box pops up (lift + slight grow, quick and without the scroll-in delay) with a soft gold glow. */
const POP_HOVER = { whileHover: { y: -10, scale: 1.025, transition: { duration: 0.25, delay: 0, ease: 'easeOut' as const } } };
const POP_GLOW =
  'transition-[box-shadow,background-color] duration-300 hover:bg-white/[0.13] hover:shadow-[0_24px_60px_-20px_rgb(0_0_0/0.55),0_0_36px_-6px_rgb(214_172_96/0.45)] hover:ring-gold-500/50';

/** Wide page container: content reaches closer to the screen edges (about 7% margin on desktop). */
const WIDE = 'mx-auto w-full max-w-[1760px] px-4 sm:px-6 lg:px-[7vw]';

/* Scroll animations (play once, when the element scrolls into view). */
const EASE = [0.22, 1, 0.36, 1] as const;
const slideIn = {
  initial: { opacity: 0, x: -40 },
  whileInView: { opacity: 1, x: 0 },
  viewport: { once: true, amount: 0.6 },
  transition: { duration: 0.7, ease: EASE },
};
const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.6 },
  transition: { duration: 0.6, delay, ease: EASE },
});
const rise = (i = 0) => ({
  initial: { opacity: 0, y: 56, scale: 0.96 },
  whileInView: { opacity: 1, y: 0, scale: 1 },
  viewport: { once: true, amount: 0.2 },
  transition: { duration: 0.7, delay: i * 0.12, ease: EASE },
});
/** Hero entrance on page load. */
const enter = (delay: number) => ({ initial: { opacity: 0, y: 28 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.8, delay, ease: EASE } });

export function LandingPage() {
  const { t } = useTranslation();
  const session = useSession();
  const authed = !!session.data?.authenticated;
  const { calmMotion } = usePreferences();

  // -mt-[73px] = header height (72px) plus its 1px border, so the video also runs under the see-through header.
  return (
    // Calm / reduced motion: elements appear without movement.
    <MotionConfig reducedMotion={calmMotion ? 'always' : 'user'}>
      <div className="relative isolate -mt-[73px] pb-16">
        <PageBackgroundVideo />
        {/* ---------------- HERO ---------------- */}
        <section className="relative overflow-hidden pt-[73px] text-cream-50 lg:flex lg:min-h-[88vh] lg:items-center">
          <div className="absolute inset-0 bg-gradient-to-r from-forest-950/70 via-forest-950/30 to-transparent" aria-hidden />
          <div className={cn(WIDE, 'relative py-16 lg:pb-12 lg:pt-36')}>
            <div className="lg:max-w-[56%]">
              <motion.h1 {...enter(0.1)} className="text-5xl leading-[1.03] text-cream-50 sm:text-7xl xl:text-[5.5rem]">
                One Farm. <span className="text-gold-500">Three Futures.</span> Better Decisions.
              </motion.h1>
              <motion.p {...enter(0.3)} className="mt-6 max-w-2xl text-xl leading-relaxed text-cream-50/90 sm:text-2xl">
                {t('landing.heroBody')}
              </motion.p>
              <motion.div {...enter(0.5)} className="mt-8 flex flex-wrap gap-3">
                {authed ? (
                  <>
                    <Button asChild size="lg" variant="gold">
                      <Link to="/explore">
                        <MapPinned aria-hidden /> {t('landing.exploreMyFarm')}
                      </Link>
                    </Button>
                  </>
                ) : (
                  <>
                    <Button asChild size="lg" variant="gold">
                      <Link to="/register" data-testid="hero-signup">
                        {t('landing.signupCta')} <ArrowRight aria-hidden />
                      </Link>
                    </Button>
                    <Button asChild size="lg" variant="outlineLight">
                      <Link to="/login">{t('nav.login')}</Link>
                    </Button>
                  </>
                )}
              </motion.div>
            </div>
          </div>
          {/* Mascot: below the text on phones/tablets; bottom-right corner of the hero on wide screens */}
          <HeroMascot authed={authed} />
        </section>

        {/* ---------------- HOW IT WORKS ---------------- */}
        <section id="how" className={cn(WIDE, 'pb-16 pt-28 lg:pt-36')}>
          <motion.h2 {...slideIn} className="text-3xl text-cream-50 sm:text-4xl">
            {t('landing.howTitle')}
          </motion.h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              { Icon: Sprout, title: t('landing.step1'), body: t('landing.step1Body') },
              { Icon: Scale, title: t('landing.step2'), body: t('landing.step2Body') },
              { Icon: ShieldCheck, title: t('landing.step3'), body: t('landing.step3Body') },
            ].map((s, i) => (
              <motion.li key={s.title} {...rise(i)} {...POP_HOVER} className={cn(GLASS, POP_GLOW, 'relative min-h-64 p-8')}>
                <span className="absolute -top-3 left-8 grid size-8 place-items-center rounded-full bg-gold-500 font-bold text-forest-900">{i + 1}</span>
                <s.Icon className="mt-2 size-9 text-gold-500" aria-hidden />
                <h3 className="mt-4 text-2xl text-cream-50">{s.title}</h3>
                <p className="mt-3 text-lg text-cream-50/80">{s.body}</p>
              </motion.li>
            ))}
          </ol>
        </section>

        {/* ---------------- INTERACTIVE PREVIEW ---------------- */}
        <section className="py-16 text-cream-50">
          <div className={WIDE}>
            <motion.h2 {...slideIn} className="text-3xl text-cream-50 sm:text-4xl">
              What you can explore
            </motion.h2>
            <motion.p {...fadeUp(0.15)} className="mt-2 max-w-2xl text-lg text-cream-50/80">
              Three tools, one farm. Each one shows where its information comes from.
            </motion.p>
            <div className="mt-10 grid gap-6 lg:grid-cols-3">
              <PreviewCard
                index={0}
                locked={!authed}
                to="/rotations"
                title="Rotation Lab"
                body="Your current rotation next to two alternatives, season by season, with benefits, risks and what to check locally."
              >
                <div className="flex items-center justify-center gap-2">
                  {['rice', 'mung-bean', 'cowpea'].map((c) => (
                    <img key={c} src={`/crops/${c}.svg`} alt="" className="size-16 rounded-2xl bg-white/90" />
                  ))}
                </div>
              </PreviewCard>
              <PreviewCard
                index={1}
                locked={!authed}
                to="/climate"
                title="Climate Time Machine"
                body="Ask “what if there were 20% less rain, or it were 2 °C warmer?” and see how the options might be affected."
              >
                <div className="flex items-center justify-center gap-6 text-gold-500">
                  <CloudSun className="size-14" aria-hidden />
                  <ArrowRight className="size-6 text-cream-50/60" aria-hidden />
                  <ThermometerSun className="size-14" aria-hidden />
                </div>
              </PreviewCard>
              <PreviewCard
                index={2}
                locked={!authed}
                to="/roots"
                title="Roots of Tomorrow"
                body="An animated farm scene: sky, crops, and the real estimated soil layers beneath your field."
              >
                <svg viewBox="0 0 200 90" className="mx-auto h-24" aria-hidden>
                  <rect width="200" height="40" fill="#cfe6f5" rx="8" />
                  <rect y="40" width="200" height="50" fill="#8a6142" rx="8" />
                  <path d="M100 40v34M100 52l-10 10M100 56l10 12M100 46l-14 6M100 48l14 4" stroke="#f5f3eb" strokeWidth="2" fill="none" strokeLinecap="round" />
                  <path d="M100 40c-8-10-6-20 0-26 6 6 8 16 0 26z" fill="#16805d" />
                </svg>
              </PreviewCard>
            </div>
          </div>
        </section>

        {/* ---------------- TRANSPARENCY ---------------- */}
        <section className="py-16">
          <div className={WIDE}>
            <motion.h2 {...slideIn} className="text-3xl text-cream-50 sm:text-4xl">
              {t('landing.transparencyTitle')}
            </motion.h2>
            <div className="mt-10 grid gap-6 lg:grid-cols-3">
              {[
                {
                  type: 'observed' as const,
                  Icon: Satellite,
                  tint: 'text-sky-200',
                  title: 'Observed',
                  body: 'Rainfall and temperature from NASA POWER, and vegetation greenness from NASA MODIS satellites.',
                },
                {
                  type: 'estimated' as const,
                  Icon: Info,
                  tint: 'text-soil-300',
                  title: 'Estimated',
                  body: 'Soil properties from SoilGrids — a global model estimate, not a test of your soil.',
                },
                {
                  type: 'farmer_provided' as const,
                  Icon: User,
                  tint: 'text-sage-400',
                  title: 'From you',
                  body: 'Your crop, soil, water and priorities. You can always correct us.',
                },
              ].map((c, i) => (
                <motion.div key={c.title} {...rise(i)} {...POP_HOVER} className={cn(GLASS, POP_GLOW, 'flex flex-col p-8')}>
                  <div className="mb-5 grid h-28 place-items-center rounded-2xl bg-white/[0.06] ring-1 ring-white/10">
                    <c.Icon className={cn('size-14', c.tint)} aria-hidden />
                  </div>
                  <h3 className="text-2xl text-cream-50">{c.title}</h3>
                  <p className="mt-3 flex-1 text-lg text-cream-50/80">{c.body}</p>
                  <div className="mt-4">
                    <ProvenanceBadge type={c.type} />
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </MotionConfig>
  );
}

/** Logged-out visitors can look at these cards but cannot open them. */
function MaybeLink({
  locked,
  to,
  className,
  testId,
  children,
}: {
  locked: boolean;
  to: string;
  className?: string;
  testId?: string;
  children: React.ReactNode;
}) {
  if (locked) {
    return (
      <div className={className} data-testid={testId} data-locked="true">
        {children}
      </div>
    );
  }
  return (
    <Link to={to} className={className} data-testid={testId}>
      {children}
    </Link>
  );
}

function LockedHint({ className }: { className?: string }) {
  return (
    <span className={cn('mt-3 inline-flex items-center gap-1.5 text-sm font-semibold', className)}>
      <Lock className="size-4" aria-hidden /> Log in to explore
    </span>
  );
}

function PreviewCard({
  to,
  title,
  body,
  children,
  locked,
  index,
}: {
  to: string;
  title: string;
  body: string;
  children: React.ReactNode;
  locked: boolean;
  index: number;
}) {
  return (
    <motion.div {...rise(index)} {...POP_HOVER} className="flex">
      <MaybeLink locked={locked} to={to} testId={`preview-${to.slice(1)}`} className={cn(GLASS, POP_GLOW, 'group flex w-full flex-col p-8')}>
        <div className="mb-5 grid h-28 place-items-center rounded-2xl bg-white/[0.06] ring-1 ring-white/10">{children}</div>
        <h3 className="text-2xl text-cream-50">{title}</h3>
        <p className="mt-3 flex-1 text-lg text-cream-50/80">{body}</p>
        {locked ? (
          <LockedHint className="mt-4 text-cream-50/60" />
        ) : (
          <span className="mt-4 inline-flex items-center gap-1 font-semibold text-gold-500">
            Open <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
          </span>
        )}
      </MaybeLink>
    </motion.div>
  );
}
