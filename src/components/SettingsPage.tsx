"use client";
import { useState } from "react";
import { DEMO_ME } from "@/lib/data/local";
import { Page, PageHeader } from "./PageHeader";
import { SectionsSheet } from "./DayDialogs";
import { Button, Confirm, Field, Segmented, inputCls } from "./ui";
import { LOCALES, useI18n, useT } from "@/lib/i18n";
import { useApp } from "@/store/app";

export function SettingsPage() {
  const ws = useApp((s) => s.ws);
  const mode = useApp((s) => s.mode);
  const act = useApp((s) => s.act);
  const planner = useApp((s) => s.planner);
  const signOut = useApp((s) => s.signOut);
  const setActor = useApp((s) => s.setDemoActor);
  const resetDemo = useApp((s) => s.resetDemo);
  const t = useT();
  const locale = useI18n((s) => s.locale);
  const setLocale = useI18n((s) => s.setLocale);
  const [sections, setSections] = useState(false);
  const [reset, setReset] = useState(false);
  if (!ws || !planner) return null;
  const zones: string[] = (typeof Intl !== "undefined" && "supportedValuesOf" in Intl ? (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone") : []).slice();
  if (!zones.includes(ws.prefs.timezone)) zones.unshift(ws.prefs.timezone);
  const demoUsers = ws.profiles.filter((p) => p.demo);

  return (
    <Page>
      <PageHeader title={t("Settings")} />
      <div className="space-y-6">
        <section className="space-y-4 rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-lg font-semibold">{t("Preferences")}</h2>
          <div>
            <p className="mb-1.5 text-sm font-medium text-muted">{t("Language")}</p>
            <Segmented label={t("Language")} value={locale} onChange={(l) => setLocale(l)} options={LOCALES.map((l) => ({ value: l.value, label: l.label }))} />
          </div>
          <Field label={t("Timezone")} htmlFor="tz" hint={t("“Today” and routine days follow this timezone.")}>
            <select id="tz" className={inputCls} value={ws.prefs.timezone} onChange={(e) => void act((p) => p.savePrefs({ ...ws.prefs, timezone: e.target.value }), { done: t("Timezone updated") })}>
              {zones.map((z) => <option key={z}>{z}</option>)}
            </select>
          </Field>
          <div>
            <p className="mb-1.5 text-sm font-medium text-muted">{t("Default card size")}</p>
            <Segmented label={t("Default density")} value={ws.prefs.defaultDensity} onChange={(d) => void act((p) => p.savePrefs({ ...ws.prefs, defaultDensity: d }))} options={[{ value: "comfortable", label: t("Comfortable") }, { value: "compact", label: t("Compact") }]} />
          </div>
          <Button onClick={() => setSections(true)}>{t("Edit day sections…")}</Button>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-lg font-semibold">{t("How progress works")}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] text-muted marker:text-accent">
            <li><strong className="text-fg">{t("I mark it done")}</strong>: {t("the card is complete only when you complete it. Checklists and targets just show progress.")}</li>
            <li><strong className="text-fg">{t("From checklists & targets")}</strong>: {t("complete when every selected checklist is fully ticked and every numeric target is reached.")}</li>
            <li>{t("Notes-only cards are never completed automatically. Bars stop at 100% even if you go past a target.")}</li>
            <li>{t("Skipping a day isn’t a failure — it’s just left out of the day’s count.")}</li>
          </ul>
        </section>

        {mode === "demo" ? (
          <section className="space-y-4 rounded-2xl border border-line bg-surface p-5">
            <h2 className="text-lg font-semibold">{t("Demo tools")}</h2>
            <p className="text-[15px] text-muted">{t("Everything is stored in this browser. Switch between the sample people to preview how shared cards look for each member — this is a local simulation, not real multi-user sharing.")}</p>
            <Field label={t("Viewing as")} htmlFor="actor">
              <select id="actor" className={inputCls} value={ws.me.id} onChange={(e) => void setActor(e.target.value)}>
                {demoUsers.map((u) => <option key={u.id} value={u.id}>{u.name}{u.id === DEMO_ME ? ` ${t("(you)")}` : ` ${t("(sample member)")}`}</option>)}
              </select>
            </Field>
            <Button variant="danger" onClick={() => setReset(true)}>{t("Reset demo data…")}</Button>
          </section>
        ) : (
          <section className="space-y-3 rounded-2xl border border-line bg-surface p-5">
            <h2 className="text-lg font-semibold">{t("Account")}</h2>
            <p className="text-muted">{t("Signed in as {email}", { email: ws.me.email ?? "" })}</p>
            <Button onClick={() => void signOut()}>{t("Sign out")}</Button>
          </section>
        )}
      </div>
      {sections && <SectionsSheet open onOpenChange={setSections} />}
      <Confirm open={reset} onOpenChange={setReset} title={t("Reset demo data?")} confirmLabel={t("Reset")} description={t("This deletes everything you changed in demo mode and restores the sample day.")} onConfirm={() => void resetDemo()} />
    </Page>
  );
}
