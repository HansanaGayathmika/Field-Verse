import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * FieldVerse mark: one field, crops in rotation.
 * - Left: three paddy (rice) plants with drooping golden grain heads.
 * - Right: soybean (round leaves + pods), maize (stalk + cob) and wheat (golden ear).
 * - A golden arrow arcs over them all: the rotation from one crop to the next.
 */
export function LogoMark({ className }: { className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <svg viewBox="0 0 64 64" className={cn('size-12 shrink-0', className)} aria-hidden>
      <defs>
        <linearGradient id={`sky${id}`} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#3a6fd8" />
          <stop offset="0.45" stopColor="#1f9fb0" />
          <stop offset="1" stopColor="#22b26a" />
        </linearGradient>
        <linearGradient id={`soil${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8a5a33" />
          <stop offset="1" stopColor="#5b3a22" />
        </linearGradient>
        <clipPath id={`clip${id}`}>
          <rect width="64" height="64" rx="15" />
        </clipPath>
      </defs>
      <g clipPath={`url(#clip${id})`}>
        <rect width="64" height="64" fill={`url(#sky${id})`} />
        {/* sun glow */}
        <circle cx="32" cy="19" r="6.5" fill="#ffe27a" opacity="0.35" />
        <circle cx="32" cy="19" r="4.2" fill="#ffe27a" />
        {/* soil */}
        <path d="M0 50 Q16 46 32 49 T64 48 V64 H0Z" fill={`url(#soil${id})`} />
        <path d="M0 53 Q18 50 34 53 T64 52" stroke="#a8784c" strokeWidth="1" fill="none" opacity="0.7" />

        {/* rotation arrow arching over the field */}
        <path d="M9 30 A23 21 0 0 1 53 28" stroke="#ffd34d" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        <path d="M49.5 24.5 L53.6 28.6 L55.4 23.2" stroke="#ffd34d" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />

        {/* left: three paddy plants */}
        {[7.5, 14.5, 21.5].map((x) => (
          <g key={x} strokeLinecap="round" fill="none">
            <path d={`M${x} 50 L${x - 3.2} 39`} stroke="#8fdc6a" strokeWidth="1.8" />
            <path d={`M${x} 50 L${x + 3.2} 39`} stroke="#8fdc6a" strokeWidth="1.8" />
            <path d={`M${x} 50 V35`} stroke="#bff28f" strokeWidth="1.9" />
            {/* drooping golden grain head */}
            <path d={`M${x} 35 Q${x + 4} 33.5 ${x + 4} 39`} stroke="#ffcf3f" strokeWidth="2.3" />
          </g>
        ))}

        {/* soybean */}
        <g>
          <path d="M33 50 V40" stroke="#7fd36b" strokeWidth="1.6" strokeLinecap="round" />
          <ellipse cx="30.4" cy="40.5" rx="2.6" ry="2.1" fill="#7fd36b" />
          <ellipse cx="35.6" cy="40.5" rx="2.6" ry="2.1" fill="#7fd36b" />
          <ellipse cx="33" cy="37.2" rx="2.3" ry="2.4" fill="#a6ec8c" />
          <ellipse cx="31" cy="45.5" rx="1.1" ry="2.3" transform="rotate(-25 31 45.5)" fill="#d9b25c" />
          <ellipse cx="35" cy="46" rx="1.1" ry="2.3" transform="rotate(25 35 46)" fill="#d9b25c" />
        </g>

        {/* maize */}
        <g strokeLinecap="round">
          <path d="M43.5 50 V27" stroke="#5fcf72" strokeWidth="2" />
          <path d="M43.5 44 Q48.5 40 51 42" stroke="#7fe08a" strokeWidth="1.6" fill="none" />
          <path d="M43.5 36 Q38.5 32 37 34" stroke="#7fe08a" strokeWidth="1.6" fill="none" />
          <ellipse cx="46" cy="36" rx="1.9" ry="4.3" fill="#ffc53a" />
          <path d="M44.4 39.5 Q44 34 46 31.5" stroke="#5fcf72" strokeWidth="1.2" fill="none" />
          <path d="M43.5 27 l-1.5 -2.5 M43.5 27 l1.6 -2.6 M43.5 27 v-3" stroke="#ffe08a" strokeWidth="0.9" />
        </g>

        {/* wheat */}
        <g strokeLinecap="round">
          <path d="M55 50 Q55 41 55.6 31" stroke="#e8b84a" strokeWidth="1.5" fill="none" />
          <path d="M55 46 Q58.5 43 59.5 40" stroke="#c9e06b" strokeWidth="1.3" fill="none" />
          {[0, 1, 2, 3].map((k) => (
            <g key={k}>
              <ellipse cx="54.4" cy={34.5 - k * 2.4} rx="1.1" ry="1.6" transform={`rotate(-30 54.4 ${34.5 - k * 2.4})`} fill="#ffc94a" />
              <ellipse cx="56.8" cy={34.5 - k * 2.4} rx="1.1" ry="1.6" transform={`rotate(30 56.8 ${34.5 - k * 2.4})`} fill="#ffc94a" />
            </g>
          ))}
          <path d="M55.6 25.5 V22.5" stroke="#ffe08a" strokeWidth="0.8" />
        </g>
      </g>
    </svg>
  );
}

export function Logo({ light, className }: { light?: boolean; className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <LogoMark className="drop-shadow-[0_2px_6px_rgb(0_0_0/0.18)]" />
      <span className={cn('whitespace-nowrap font-display text-[1.5rem] font-bold tracking-tight', light ? 'text-cream-50' : 'text-forest-900')}>
        Field<span className={light ? 'text-[#ffd34d]' : 'text-emerald-600'}>Verse</span>
      </span>
    </span>
  );
}
