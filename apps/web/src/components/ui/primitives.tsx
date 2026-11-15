/* shadcn-style wrappers around Radix primitives, styled for FieldVerse. */
import * as React from 'react';
import { Accordion as A, Dialog as D, Slider as S, Tabs as T, Switch as Sw, Label as L } from 'radix-ui';
import { ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ---------- Accordion ---------- */
export const Accordion = A.Root;
export function AccordionItem({ className, ...p }: React.ComponentProps<typeof A.Item>) {
  return <A.Item className={cn('border-b border-forest-900/10 last:border-0', className)} {...p} />;
}
export function AccordionTrigger({ className, children, ...p }: React.ComponentProps<typeof A.Trigger>) {
  return (
    <A.Header className="flex">
      <A.Trigger
        className={cn(
          'flex flex-1 cursor-pointer items-center justify-between gap-3 py-4 text-left font-semibold text-forest-900 hover:text-emerald-700 [&[data-state=open]>svg]:rotate-180',
          className,
        )}
        {...p}
      >
        {children}
        <ChevronDown className="size-5 shrink-0 transition-transform" aria-hidden />
      </A.Trigger>
    </A.Header>
  );
}
export function AccordionContent({ className, children, ...p }: React.ComponentProps<typeof A.Content>) {
  return (
    <A.Content className="overflow-hidden text-[0.95rem]" {...p}>
      <div className={cn('pb-4', className)}>{children}</div>
    </A.Content>
  );
}

/* ---------- Dialog ---------- */
export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;
export function DialogContent({ className, children, title, description, ...p }: React.ComponentProps<typeof D.Content> & { title: string; description?: string }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-[1000] bg-forest-950/60 backdrop-blur-[2px]" />
      <D.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-[1001] max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl',
          className,
        )}
        {...p}
      >
        <D.Title className="pr-8 font-display text-xl text-forest-900">{title}</D.Title>
        {description ? <D.Description className="mt-1 text-sm text-ink-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
        <div className="mt-4">{children}</div>
        <D.Close className="absolute right-4 top-4 grid size-10 cursor-pointer place-items-center rounded-full hover:bg-cream-100" aria-label="Close">
          <X className="size-5" />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}

/* ---------- Slider ---------- */
export function Slider({ className, thumbLabel, ...p }: React.ComponentProps<typeof S.Root> & { thumbLabel: string }) {
  return (
    <S.Root className={cn('relative flex h-10 w-full touch-none select-none items-center', className)} {...p}>
      <S.Track className="relative h-2.5 grow overflow-hidden rounded-full bg-cream-200">
        <S.Range className="absolute h-full rounded-full bg-emerald-600" />
      </S.Track>
      <S.Thumb
        aria-label={thumbLabel}
        className="block size-7 cursor-grab rounded-full border-4 border-white bg-emerald-600 shadow-md focus-visible:outline-3 focus-visible:outline-gold-500"
      />
    </S.Root>
  );
}

/* ---------- Tabs ---------- */
export const Tabs = T.Root;
export function TabsList({ className, ...p }: React.ComponentProps<typeof T.List>) {
  return <T.List className={cn('inline-flex flex-wrap gap-1 rounded-full bg-cream-200 p-1', className)} {...p} />;
}
export function TabsTrigger({ className, ...p }: React.ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        'min-h-10 cursor-pointer rounded-full px-4 text-sm font-semibold text-forest-800 data-[state=active]:bg-white data-[state=active]:text-forest-900 data-[state=active]:shadow',
        className,
      )}
      {...p}
    />
  );
}
export const TabsContent = T.Content;

/* ---------- Switch ---------- */
export function Switch({ className, ...p }: React.ComponentProps<typeof Sw.Root>) {
  return (
    <Sw.Root
      className={cn('relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full bg-forest-900/25 transition-colors data-[state=checked]:bg-emerald-600', className)}
      {...p}
    >
      <Sw.Thumb className="block size-6 translate-x-0.5 translate-y-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[1.375rem]" />
    </Sw.Root>
  );
}

export function Label({ className, ...p }: React.ComponentProps<typeof L.Root>) {
  return <L.Root className={cn('text-sm font-semibold text-forest-900', className)} {...p} />;
}
