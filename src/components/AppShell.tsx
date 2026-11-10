"use client";
import clsx from "clsx";
import { CalendarDays, History, Layers, Settings, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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
        <div role="alert" className="max-w-md rounded-3xl border border-danger/50 bg-danger/10 p-6 text-center">
          <h1 className="font-serif text-2xl">Dayview couldn’t start</h1>
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
  return (
    <div className="min-h-dvh md:pl-60">
      {mode === "demo" && <DemoBanner onInfo={() => setInfo(true)} />}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-[#171310] p-4 md:flex" aria-label="Primary">
        <p className="mb-6 px-3 pt-2 font-serif text-2xl text-amber">Dayview</p>
        <nav className="space-y-1">
          {[...NAV, { href: "/settings", label: "Settings", icon: Settings }].map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={active(href) ? "page" : undefined} className={clsx("flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px]", active(href) ? "bg-surface-2 text-ivory" : "text-muted hover:bg-surface hover:text-ivory")}>
              <Icon size={18} aria-hidden /> {label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="pb-24 md:pb-0">{children}</main>
      <nav aria-label="Primary" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-[#171310]/95 backdrop-blur md:hidden">
        <ul className="mx-auto grid max-w-md grid-cols-4">
          {NAV.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link href={href} aria-current={active(href) ? "page" : undefined} className={clsx("relative flex min-h-16 flex-col items-center justify-center gap-1 text-xs", active(href) ? "text-amber" : "text-muted")}>
                <Icon size={22} aria-hidden /> {label}
                {active(href) && <span aria-hidden className="absolute bottom-0 h-0.5 w-10 rounded-full bg-amber" />}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <CardEditorHost />
      <SearchSheet />
      <Toasts />
      <Sheet open={info} onOpenChange={setInfo} title="You’re in demo mode" description="No account or backend is connected.">
        <div className="space-y-3 text-[15px]">
          <p>Everything you see is saved in <strong>this browser only</strong> (localStorage) so you can try the whole app straight away. Reloading keeps your changes; clearing site data or using Settings → Reset removes them.</p>
          <p><strong>Sharing across accounts needs the backend.</strong> The “Family” group, Maja and Erik are <strong>sample members stored locally</strong> — a way to preview how shared cards behave. No one else can see your data, and nothing is sent anywhere.</p>
          <p className="text-muted">To enable real accounts, groups, invitations and live sharing, connect Supabase — see the README (set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, then run the migration).</p>
        </div>
      </Sheet>
    </div>
  );
}

function DemoBanner({ onInfo }: { onInfo: () => void }) {
  return (
    <div className="flex min-h-9 items-center justify-center gap-2 border-b border-amber/30 bg-amber/10 px-3 py-1 text-center text-[13px]">
      <span><strong className="font-semibold text-amber">Demo mode</strong> · saved on this device only<span className="hidden sm:inline"> · sample group members are simulated</span></span>
      <button onClick={onInfo} className="min-h-8 rounded-md px-2 font-medium text-amber underline underline-offset-2 hover:bg-amber/10">Details</button>
    </div>
  );
}
