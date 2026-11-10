"use client";
import { Check, ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { addDays, formatLong } from "@/lib/domain/dates";
import { scopeFor } from "@/lib/domain/permissions";
import { cardProgress, emptyState } from "@/lib/domain/progress";
import type { CardInstance, DateStr, ProgressRecord } from "@/lib/domain/types";
import { useApp } from "@/store/app";
import { Page, PageHeader } from "./PageHeader";
import { Button, Segmented, Spinner } from "./ui";
import { useUi } from "@/store/ui";

export function HistoryPage() {
  const planner = useApp((s) => s.planner);
  const setDate = useApp((s) => s.setDate);
  const [days, setDays] = useState<14 | 30 | 90>(14);
  const [data, setData] = useState<{ instances: CardInstance[]; progress: ProgressRecord[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const version = useApp((s) => s.data);

  useEffect(() => {
    if (!planner) return;
    const today = planner.today();
    let live = true;
    planner.repo.loadRange(addDays(today, -days), addDays(today, -1)).then((d) => live && (setData(d), setError(null)), (e) => live && setError(String(e?.message ?? e)));
    return () => void (live = false);
  }, [planner, days, version]);

  if (!planner) return null;
  const me = planner.me.id;
  const byDate = new Map<DateStr, CardInstance[]>();
  data?.instances.forEach((i) => byDate.set(i.date, [...(byDate.get(i.date) ?? []), i]));
  const dates = [...byDate.keys()].sort().reverse();
  const recs = new Map((data?.progress ?? []).map((p) => [`${p.instanceId}|${p.scope}`, p.state]));

  return (
    <Page>
      <PageHeader title="History" subtitle="What was recorded on earlier days. Editing a routine never changes these records, and days without records are simply blank — never a failure." actions={<><Button small onClick={() => useUi.getState().setSearchOpen(true)}><Search size={14} aria-hidden /> Search</Button><Segmented label="Range" value={String(days) as "14"} onChange={(v) => setDays(Number(v) as 14)} options={[{ value: "14", label: "2 weeks" }, { value: "30", label: "30 days" }, { value: "90", label: "90 days" }]} /></>} />
      {error ? <p role="alert" className="rounded-2xl border border-danger/50 bg-danger/10 p-4">Couldn’t load history: {error}</p> : !data ? <div className="flex justify-center py-12"><Spinner /></div> : dates.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-10 text-center text-muted">No earlier days recorded in this range yet.</p>
      ) : (
        <ul className="space-y-3">
          {dates.map((d) => {
            const list = byDate.get(d)!.filter((i) => !i.skipped);
            const skipped = byDate.get(d)!.filter((i) => i.skipped);
            const rows = list.map((i) => {
              const st = recs.get(`${i.id}|${scopeFor(i, me)}`) ?? emptyState();
              return { i, p: cardProgress(i.spec, st) };
            }).sort((a, b) => (a.i.spec.time ?? "99").localeCompare(b.i.spec.time ?? "99"));
            const done = rows.filter((r) => r.p.complete).length;
            return (
              <li key={d}>
                <details className="group rounded-xl border border-line bg-surface">
                  <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2">
                    <ChevronRight size={18} className="text-muted transition-transform group-open:rotate-90" aria-hidden />
                    <span className="text-[17px] font-semibold">{formatLong(d)}</span>
                    <span className="ml-auto text-[15px] text-muted">{rows.length ? `${done} of ${rows.length} complete` : "all skipped"}{skipped.length ? ` · ${skipped.length} skipped` : ""}</span>
                  </summary>
                  <div className="border-t border-line px-4 py-2">
                    <ul className="divide-y divide-line/70">
                      {rows.map(({ i, p }) => (
                        <li key={i.id} className="flex min-h-11 items-center gap-3 py-1.5">
                          <span className={`grid size-6 shrink-0 place-items-center rounded-full border-2 ${p.complete ? "border-transparent bg-accent" : "border-line"}`} aria-hidden>{p.complete && <Check size={14} strokeWidth={3} className="text-accent-ink" />}</span>
                          <span className="flex-1">{i.spec.title}<span className="sr-only">{p.complete ? ", complete" : ", not complete"}</span></span>
                          <span className="text-sm text-muted">{p.label}</span>
                        </li>
                      ))}
                    </ul>
                    <Link href="/" onClick={() => void setDate(d)} className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline">Open this day →</Link>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}
