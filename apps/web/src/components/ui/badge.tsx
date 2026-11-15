import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold [&_svg]:size-3.5', {
  variants: {
    variant: {
      neutral: 'bg-cream-200 text-forest-900',
      green: 'bg-emerald-100 text-emerald-700',
      gold: 'bg-gold-100 text-[#6d4f12]',
      sky: 'bg-sky-100 text-[#1c4f7a]',
      soil: 'bg-[#f1e4d6] text-soil-700',
      warning: 'bg-[#fdf0d5] text-warning',
      critical: 'bg-[#fde3e1] text-critical',
      dark: 'bg-forest-900 text-cream-50',
      outline: 'border border-forest-900/20 text-forest-900',
    },
  },
  defaultVariants: { variant: 'neutral' },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
