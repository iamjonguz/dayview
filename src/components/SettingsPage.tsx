"use client";
import { useState } from "react";
import { DEMO_ME } from "@/lib/data/local";
import { Page, PageHeader } from "./PageHeader";
import { SectionsSheet } from "./DayDialogs";
import { Button, Confirm, Field, Segmented, inputCls } from "./ui";
import { useApp } from "@/store/app";

export function SettingsPage() {
  const ws = useApp((s) => s.ws);
  const mode = useApp((s) => s.mode);
  const act = useApp((s) => s.act);
  const planner = useApp((s) => s.planner);
  const signOut = useApp((s) => s.signOut);
  const setActor = useApp((s) => s.setDemoActor);
  const resetDemo = useApp((s) => s.resetDemo);
  const [sections, setSections] = useState(false);
  const [reset, setReset] = useState(false);
  if (!ws || !planner) return null;
  const zones: string[] = (typeof Intl !== "undefined" && "supportedValuesOf" in Intl ? (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone") : []).slice();
  if (!zones.includes(ws.prefs.timezone)) zones.unshift(ws.prefs.timezone);
  const demoUsers = ws.profiles.filter((p) => p.demo);

  return (
    <Page>
      <PageHeader title="Settings" />
      <div className="space-y-6">
        <section className="space-y-4 rounded-3xl border border-line bg-surface p-5">
          <h2 className="font-serif text-2xl">Preferences</h2>
          <Field label="Timezone" htmlFor="tz" hint="“Today” and routine days follow this timezone.">
            <select id="tz" className={inputCls} value={ws.prefs.timezone} onChange={(e) => void act((p) => p.savePrefs({ ...ws.prefs, timezone: e.target.value }), { done: "Timezone updated" })}>
              {zones.map((z) => <option key={z}>{z}</option>)}
            </select>
          </Field>
          <div>
            <p className="mb-1.5 text-sm font-medium text-muted">Default card size</p>
            <Segmented label="Default density" value={ws.prefs.defaultDensity} onChange={(d) => void act((p) => p.savePrefs({ ...ws.prefs, defaultDensity: d }))} options={[{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }]} />
          </div>
          <Button onClick={() => setSections(true)}>Edit day sections…</Button>
        </section>

        <section className="rounded-3xl border border-line bg-surface p-5">
          <h2 className="font-serif text-2xl">How progress works</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] text-muted marker:text-amber">
            <li><strong className="text-ivory">I mark it done</strong>: the card is complete only when you complete it. Checklists and targets just show progress.</li>
            <li><strong className="text-ivory">From checklists &amp; targets</strong>: complete when every selected checklist is fully ticked and every numeric target is reached.</li>
            <li>Notes-only cards are never completed automatically. Bars stop at 100% even if you go past a target.</li>
            <li>Skipping a day isn’t a failure — it’s just left out of the day’s count.</li>
          </ul>
        </section>

        {mode === "demo" ? (
          <section className="space-y-4 rounded-3xl border border-amber/40 bg-amber/5 p-5">
            <h2 className="font-serif text-2xl">Demo tools</h2>
            <p className="text-[15px] text-muted">Everything is stored in this browser. Switch between the sample people to preview how shared cards look for each member — this is a local simulation, not real multi-user sharing.</p>
            <Field label="Viewing as" htmlFor="actor">
              <select id="actor" className={inputCls} value={ws.me.id} onChange={(e) => void setActor(e.target.value)}>
                {demoUsers.map((u) => <option key={u.id} value={u.id}>{u.name}{u.id === DEMO_ME ? " (you)" : " (sample member)"}</option>)}
              </select>
            </Field>
            <Button variant="danger" onClick={() => setReset(true)}>Reset demo data…</Button>
          </section>
        ) : (
          <section className="space-y-3 rounded-3xl border border-line bg-surface p-5">
            <h2 className="font-serif text-2xl">Account</h2>
            <p className="text-muted">Signed in as {ws.me.email}</p>
            <Button onClick={() => void signOut()}>Sign out</Button>
          </section>
        )}
      </div>
      {sections && <SectionsSheet open onOpenChange={setSections} />}
      <Confirm open={reset} onOpenChange={setReset} title="Reset demo data?" confirmLabel="Reset" description="This deletes everything you changed in demo mode and restores the sample day." onConfirm={() => void resetDemo()} />
    </Page>
  );
}
