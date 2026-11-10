import type { ReactNode } from "react";

/** Heading, description and actions stack on narrow screens so nothing is squeezed. */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 sm:flex-1">
        <h1 className="font-serif text-[32px] leading-none md:text-5xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-prose text-[15px] leading-snug text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">{actions}</div>}
    </header>
  );
}
export const Page = ({ children }: { children: ReactNode }) => <div className="mx-auto w-full min-w-0 max-w-4xl px-4 pb-8 pt-4 md:px-8 md:pt-8">{children}</div>;
