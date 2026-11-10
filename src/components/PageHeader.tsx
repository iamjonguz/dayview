import type { ReactNode } from "react";
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="mb-5 flex items-start justify-between gap-3">
      <div>
        <h1 className="font-serif text-[34px] leading-none md:text-5xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-xl text-[15px] text-muted">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{actions}</div>
    </header>
  );
}
export const Page = ({ children }: { children: ReactNode }) => <div className="mx-auto w-full max-w-4xl px-4 pb-10 pt-4 md:px-8 md:pt-8">{children}</div>;
