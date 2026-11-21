"use client";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { cloneSpec, newCardSpec } from "@/lib/domain/factory";
import { describeRule } from "@/lib/domain/recurrence";
import { formatTimeRange, weekdayShort } from "@/lib/domain/dates";
import type { CardSpec, CardTemplate, DayLayout, Series } from "@/lib/domain/types";
import { useT } from "@/lib/i18n";
import { useApp } from "@/store/app";
import { useUi } from "@/store/ui";
import { ApplyLayoutSheet, AutoApplyPicker, SaveLayoutSheet } from "./DayDialogs";
import { Page, PageHeader } from "./PageHeader";
import { RepeatEditor, repeatToRule, ruleToRepeat, type RepeatValue } from "./RepeatEditor";
import { SpecEditor } from "./SpecEditor";
import { Button, Confirm, Field, Sheet, inputCls } from "./ui";

type Tab = "routines" | "cards" | "layouts";

export function TemplatesPage() {
  const t = useT();
  const ws = useApp((s) => s.ws);
  const date = useApp((s) => s.date);
  const act = useApp((s) => s.act);
  const planner = useApp((s) => s.planner);
  const openCreate = useUi((s) => s.openCreate);
  const [tab, setTab] = useState<Tab>("routines");
  const [routine, setRoutine] = useState<Series | null>(null);
  const [ending, setEnding] = useState<Series | null>(null);
  const [tpl, setTpl] = useState<{ tpl?: CardTemplate } | null>(null);
  const [delTpl, setDelTpl] = useState<CardTemplate | null>(null);
  const [layout, setLayout] = useState<DayLayout | null>(null);
  const [delLayout, setDelLayout] = useState<DayLayout | null>(null);
  const [applying, setApplying] = useState(false);
  const [saving, setSaving] = useState(false);
  if (!ws || !planner) return null;
  const today = planner.today();
  const tabs: [Tab, string][] = [["routines", t("Routines")], ["cards", t("Card templates")], ["layouts", t("Day layouts")]];
  const active = ws.series.filter((s) => !s.rule.end || s.rule.end >= today);
  const ended = ws.series.filter((s) => s.rule.end && s.rule.end < today);

  return (
    <Page>
      <PageHeader title={t("Templates")} subtitle={t("Reusable pieces. Changing them shapes future days — what already happened stays as it was.")} />
      <div role="tablist" aria-label={t("Template types")} className="mb-5 flex gap-1 rounded-2xl border border-line bg-surface p-1">
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`min-h-11 flex-1 rounded-xl px-2 text-[15px] ${tab === k ? "bg-accent font-semibold text-accent-ink" : "hover:bg-surface-2"}`}>{l}</button>
        ))}
      </div>

      {tab === "routines" && (
        <section aria-label={t("Routines")} className="space-y-3">
          <p className="text-sm text-muted">{t("Routines create a card on each scheduled day. Add one by choosing “Repeat” when you create a card.")}</p>
          {active.length === 0 && <p className="rounded-2xl border border-dashed border-line p-8 text-center text-muted">{t("No routines yet.")}</p>}
          {active.map((s) => (
            <Row key={s.id} title={s.spec.title} meta={`${describeRule(s.rule)}${s.spec.time ? " · " + formatTimeRange(s.spec.time, s.spec.endTime) : ""} · ${t("since {date}", { date: s.rule.start })}`}>
              <Button small onClick={() => setRoutine(s)}><Pencil size={14} aria-hidden /> {t("Edit")}</Button>
              <Button small variant="danger" onClick={() => setEnding(s)}>{t("End…")}</Button>
            </Row>
          ))}
          {ended.length > 0 && (
            <details className="rounded-2xl border border-line">
              <summary className="min-h-12 cursor-pointer px-4 py-3 text-muted">{t("Ended routines ({n})", { n: ended.length })}</summary>
              <ul className="divide-y divide-line px-4">{ended.map((s) => <li key={s.id} className="py-2 text-sm text-muted">{s.spec.title} · {describeRule(s.rule)}</li>)}</ul>
            </details>
          )}
        </section>
      )}

      {tab === "cards" && (
        <section aria-label={t("Card templates")} className="space-y-3">
          <div className="flex justify-end"><Button variant="primary" onClick={() => setTpl({})}><Plus size={16} aria-hidden /> {t("New template")}</Button></div>
          {ws.templates.map((tm) => (
            <Row key={tm.id} title={tm.name} meta={tm.description ?? t("{n} blocks", { n: tm.spec.blocks.length })} badge={tm.ownerId ? undefined : t("Starter")}>
              <Button small variant="primary" onClick={() => openCreate(date, { templateId: tm.id })}>{date === today ? t("Use on today") : t("Use on {date}", { date })}</Button>
              {tm.ownerId && <><Button small onClick={() => setTpl({ tpl: tm })}><Pencil size={14} aria-hidden /> {t("Edit")}</Button><Button small variant="danger" onClick={() => setDelTpl(tm)} aria-label={t("Delete template {name}", { name: tm.name })}><Trash2 size={14} aria-hidden /></Button></>}
            </Row>
          ))}
        </section>
      )}

      {tab === "layouts" && (
        <section aria-label={t("Day layouts")} className="space-y-3">
          <div className="flex flex-wrap justify-end gap-2"><Button onClick={() => setApplying(true)}>{date === today ? t("Apply to today") : t("Apply to {date}", { date })}</Button><Button variant="primary" onClick={() => setSaving(true)}>{date === today ? t("Save today as layout") : t("Save {date} as layout", { date })}</Button></div>
          {ws.layouts.length === 0 && <p className="rounded-2xl border border-dashed border-line p-8 text-center text-muted">{t("No layouts yet. Set up a day you like, then save it — for example one for weekdays and one for weekends.")}</p>}
          {ws.layouts.map((l) => (
            <Row key={l.id} title={l.name} meta={`${l.entries.length === 1 ? t("{n} card", { n: 1 }) : t("{n} cards", { n: l.entries.length })}${l.autoApply.length ? " · " + t("auto on {days}", { days: l.autoApply.map((d) => weekdayShort(d)).join(", ") }) : ""}`}>
              <Button small onClick={() => setLayout(l)}><Pencil size={14} aria-hidden /> {t("Edit")}</Button>
              <Button small variant="danger" onClick={() => setDelLayout(l)} aria-label={t("Delete layout {name}", { name: l.name })}><Trash2 size={14} aria-hidden /></Button>
            </Row>
          ))}
        </section>
      )}

      {routine && <RoutineSheet series={routine} today={today} onClose={() => setRoutine(null)} />}
      {tpl && <TemplateSheet tpl={tpl.tpl} onClose={() => setTpl(null)} />}
      {layout && <LayoutSheet l={layout} onClose={() => setLayout(null)} />}
      <ApplyLayoutSheet open={applying} onOpenChange={setApplying} date={date} />
      {saving && <SaveLayoutSheet open onOpenChange={setSaving} date={date} />}
      <Confirm open={!!ending} onOpenChange={(o) => !o && setEnding(null)} title={t("End “{name}”?", { name: ending?.spec.title ?? "" })} confirmLabel={t("End routine")} description={t("Upcoming untouched days are removed. Everything that already happened — completions, notes, checklists — stays in History.")} onConfirm={() => void act((p) => p.endSeriesFrom(ending!, today), { done: t("Routine ended") })} />
      <Confirm open={!!delTpl} onOpenChange={(o) => !o && setDelTpl(null)} title={t("Delete template “{name}”?", { name: delTpl?.name ?? "" })} description={t("Cards already created from it are not affected.")} onConfirm={() => void act((p) => p.deleteTemplate(delTpl!.id), { done: t("Template deleted") })} />
      <Confirm open={!!delLayout} onOpenChange={(o) => !o && setDelLayout(null)} title={t("Delete layout “{name}”?", { name: delLayout?.name ?? "" })} description={t("Days that already used it keep their cards.")} onConfirm={() => void act((p) => p.deleteLayout(delLayout!.id), { done: t("Layout deleted") })} />
    </Page>
  );
}

function Row({ title, meta, badge, children }: { title: string; meta: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4">
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-semibold text-xl">{title}{badge && <span className="rounded-full bg-surface-2 px-2 py-0.5 font-sans text-xs text-muted">{badge}</span>}</p>
        <p className="text-sm text-muted">{meta}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function RoutineSheet({ series, today, onClose }: { series: Series; today: string; onClose: () => void }) {
  const t = useT();
  const act = useApp((s) => s.act);
  const [spec, setSpec] = useState<CardSpec>(cloneSpec(series.spec, false));
  const [rep, setRep] = useState<RepeatValue>(ruleToRepeat(series.rule));
  const from = today < series.rule.start ? series.rule.start : today;
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} wide title={t("Edit routine")} description={t("Applies from {date} onwards. Earlier days keep exactly what was recorded.", { date: from })}
      footer={<><Button onClick={onClose}>{t("Cancel")}</Button><Button variant="primary" disabled={!spec.title.trim() || (rep.kind === "weekdays" && rep.weekdays.length === 0)} onClick={async () => { const r = await act((p) => p.editRoutine(series, spec, repeatToRule(rep)!, today), { done: t("Routine updated from today") }); if (r.ok) onClose(); }}>{t("Save from {date}", { date: from })}</Button></>}>
      <div className="space-y-8"><SpecEditor spec={spec} onChange={setSpec} /><section className="space-y-3"><h3 className="font-semibold text-xl">{t("Repeat")}</h3><RepeatEditor value={rep} onChange={setRep} allowOnce={false} /></section></div>
    </Sheet>
  );
}

function TemplateSheet({ tpl, onClose }: { tpl?: CardTemplate; onClose: () => void }) {
  const t = useT();
  const act = useApp((s) => s.act);
  const [name, setName] = useState(tpl?.name ?? "");
  const [spec, setSpec] = useState<CardSpec>(tpl ? cloneSpec(tpl.spec, false) : newCardSpec());
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} wide title={tpl ? t("Edit template") : t("New template")} description={t("Templates are starting points; cards made from them are independent copies.")}
      footer={<><Button onClick={onClose}>{t("Cancel")}</Button><Button variant="primary" disabled={!name.trim() && !spec.title.trim()} onClick={async () => { const r = await act((p) => p.saveTemplate(name || spec.title, spec, tpl?.id), { done: t("Template saved") }); if (r.ok) onClose(); }}>{t("Save")}</Button></>}>
      <div className="space-y-8"><Field label={t("Template name")} htmlFor="tn"><input id="tn" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field><SpecEditor spec={spec} onChange={setSpec} /></div>
    </Sheet>
  );
}

function LayoutSheet({ l, onClose }: { l: DayLayout; onClose: () => void }) {
  const t = useT();
  const act = useApp((s) => s.act);
  const [d, setD] = useState<DayLayout>(l);
  const [editing, setEditing] = useState<string | null>(null);
  const entry = d.entries.find((e) => e.id === editing);
  return (
    <>
      <Sheet open onOpenChange={(o) => !o && onClose()} title={t("Edit layout")}
        footer={<><Button onClick={onClose}>{t("Cancel")}</Button><Button variant="primary" disabled={!d.name.trim()} onClick={async () => { const r = await act((p) => p.updateLayout(d), { done: t("Layout saved") }); if (r.ok) onClose(); }}>{t("Save")}</Button></>}>
        <div className="space-y-5">
          <Field label={t("Name")} htmlFor="lnm"><input id="lnm" className={inputCls} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
          <AutoApplyPicker value={d.autoApply} onChange={(autoApply) => setD({ ...d, autoApply })} />
          <div>
            <p className="mb-1.5 text-sm font-medium text-muted">{t("Cards")}</p>
            <ul className="space-y-2">
              {d.entries.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2">
                  <span>{e.spec.title}<span className="ml-2 text-sm text-muted">{formatTimeRange(e.spec.time, e.spec.endTime)}</span></span>
                  <span className="flex gap-1"><Button small onClick={() => setEditing(e.id)}>{t("Edit")}</Button><Button small variant="danger" aria-label={t("Remove {name}", { name: e.spec.title })} onClick={() => setD({ ...d, entries: d.entries.filter((x) => x.id !== e.id) })}><Trash2 size={14} aria-hidden /></Button></span>
                </li>
              ))}
              {d.entries.length === 0 && <li className="text-sm text-muted">{t("No cards left in this layout.")}</li>}
            </ul>
          </div>
        </div>
      </Sheet>
      {entry && (
        <Sheet open onOpenChange={(o) => !o && setEditing(null)} wide title={t("Edit “{name}”", { name: entry.spec.title })} footer={<Button variant="primary" onClick={() => setEditing(null)}>{t("Done")}</Button>}>
          <SpecEditor spec={entry.spec} onChange={(spec) => setD({ ...d, entries: d.entries.map((x) => (x.id === entry.id ? { ...x, spec } : x)) })} />
        </Sheet>
      )}
    </>
  );
}
