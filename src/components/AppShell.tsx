"use client";
import clsx from "clsx";
import { CalendarDays, History, Layers, Settings, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BRAND } from "@/lib/brand";
import { useApp } from "@/store/app";
import { AuthPanel } from "./AuthPanel";
import { CardEditorHost } from "./CardEditor";
import { SearchSheet } from "./FindAndCarry";
import { Button, Sheet, Spinner, Toasts } from "./ui";

const NAV = [
  { href: "/", label: "Today", icon: CalendarDays },
  { href: "/history", label: "History", icon: History },
  { href: "/templates", label: "Templates", icon: Layers },
  { href: "/groups", label: "Groups", icon: Users },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const phase = useApp((s) => s.phase);
  const mode = useApp((s) => s.mode);
  const fatal = useApp((s) => s.fatal);
  const boot = useApp((s) => s.boot);
  const pathname = usePathname();
  const [info, setInfo] = useState(false);
  useEffect(() => void boot(), [boot]);

  if (phase === "needs-auth") return <><AuthPanel /><Toasts /></>;
  if (phase === "error")
    return (
      <main className="grid min-h-dvh place-items-center p-6">
        <div role="alert" className="max-w-md rounded-2xl border border-danger/50 bg-danger/10 p-6 text-center">
          <h1 className="text-xl font-semibold">{BRAND.name} couldn’t start</h1>
          <p className="mt-2 text-sm text-muted">{fatal}</p>
          <Button className="mt-4" onClick={() => void boot()}>Try again</Button>
        </div>
      </main>
    );
  if (phase === "booting")
    return (
      <main className="grid min-h-dvh place-items-center"><div className="flex items-center gap-3 text-muted"><Spinner /> Opening your day…</div></main>
    );

  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const railItems = [...NAV, { href: "/settings", label: "Settings", icon: Settings }];
  return (
    <div className="min-h-dvh md:pl-[4.5rem] lg:pl-56">
      {mode === "demo" && <DemoBanner onInfo={() => setInfo(true)} />}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[4.5rem] flex-col border-r border-line bg-nav px-2 py-4 md:flex lg:w-56 lg:px-3" aria-label="Primary">
        <p className="mb-6 flex items-center justify-center gap-2 px-1 pt-1 text-lg font-semibold lg:justify-start lg:px-3">
          <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-accent text-sm font-bold text-accent-ink">{BRAND.name.charAt(0)}</span>
          <span className="hidden lg:inline">{BRAND.name}</span>
        </p>
        <nav className="space-y-1">
          {railItems.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-label={label} title={label} aria-current={active(href) ? "page" : undefined} className={clsx("flex min-h-11 items-center justify-center gap-3 rounded-xl px-3 text-[15px] lg:justify-start", active(href) ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface hover:text-fg")}>
              <Icon size={20} aria-hidden className={active(href) ? "text-accent" : ""} /> <span className="hidden lg:inline">{label}</span>
            </Link>
          ))}
        </nav>
      </aside>
      <main className="pb-[calc(var(--nav-h)+env(safe-area-inset-bottom,0px)+1rem)] md:pb-0">{children}</main>
      <nav aria-label="Primary" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-nav md:hidden">
        <ul className="mx-auto grid max-w-md grid-cols-4">
          {NAV.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link href={href} aria-current={active(href) ? "page" : undefined} className={clsx("relative flex h-16 flex-col items-center justify-center gap-1 text-[13px] font-medium", active(href) ? "text-accent" : "text-muted")}>
                <Icon size={22} aria-hidden /> {label}
                {active(href) && <span aria-hidden className="absolute top-0 h-0.5 w-10 rounded-full bg-accent" />}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <CardEditorHost />
      <SearchSheet />
      <Toasts />
      <Sheet open={info} onOpenChange={setInfo} title="About demo mode" description="No account or backend is connected.">
        <div className="space-y-3 text-[15px]">
          <p>Everything is saved in <strong>this browser only</strong>, so you can try the whole app right away. Reloading keeps your changes; Settings → Reset removes them.</p>
          <p><strong>Sharing across accounts needs the backend.</strong> The Family group, Maja and Erik are <strong>sample members stored locally</strong> to preview how shared cards behave. Nothing is sent anywhere.</p>
          <p className="text-muted">To enable real accounts, groups and invitations, connect Supabase (see the README).</p>
        </div>
      </Sheet>
    </div>
  );
}

function DemoBanner({ onInfo }: { onInfo: () => void }) {
  return (
    <div className="flex min-h-9 items-center justify-center gap-2 border-b border-line bg-nav px-3 text-[14px] text-muted">
      <span aria-hidden className="size-1.5 rounded-full bg-accent" />
      <span><strong className="font-semibold text-fg">Demo</strong> · saved on this device only</span>
      <button onClick={onInfo} className="-my-1 inline-flex min-h-11 items-center rounded-md px-2 font-medium text-accent underline underline-offset-2">Details</button>
    </div>
  );
}
