import * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-[1.15em] [&_svg]:shrink-0 cursor-pointer',
  {
    variants: {
      variant: {
        primary: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
        gold: 'bg-gold-500 text-forest-900 hover:bg-gold-600 hover:text-white shadow-sm',
        secondary: 'bg-white text-forest-900 border border-forest-900/15 hover:bg-sage-100',
        ghost: 'text-forest-900 hover:bg-forest-900/5',
        dark: 'bg-forest-900 text-cream-50 hover:bg-forest-800',
        outlineLight: 'border border-cream-50/40 text-cream-50 hover:bg-cream-50/10',
        danger: 'bg-critical text-white hover:opacity-90',
        link: 'text-emerald-700 underline-offset-4 hover:underline px-0 h-auto',
      },
      size: {
        sm: 'h-9 px-4 text-sm',
        md: 'h-11 px-5 text-[0.95rem]',
        lg: 'h-13 px-7 text-base',
        icon: 'size-11',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot.Root : 'button';
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = 'Button';
