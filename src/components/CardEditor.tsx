"use client";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { cloneSpec } from "@/lib/domain/factory";
import { newCardSpec } from "@/lib/domain/factory";
import { formatLong } from "@/lib/domain/dates";
import { describeRule } from "@/lib/domain/recurrence";
import { canEditRole, roleIn } from "@/lib/domain/permissions";
import type { CardInstance, CardSpec, CompletionMode, ID } from "@/lib/domain/types";
import { useT } from "@/lib/i18n";
import { useApp } from "@/store/app";
import { useUi } from "@/store/ui";
import { RepeatEditor, repeatToRule, ruleToRepeat, type RepeatValue } from "./RepeatEditor";
import { Disclosure, Help, SpecEditor } from "./SpecEditor";
import { Button, Confirm, Field, Segmented, Sheet, inputCls } from "./ui";

/** Create / edit sheet, mounted once in the shell and driven by the UI store. */
export function CardEditorHost() {
  const editor = useUi((s) => s.editor);
  const close = useUi((s) => s.closeEditor);
  const inst = useApp((s) => (editor?.kind === "edit" ? s.data?.instances.find((i) => i.id === editor.instanceId) : undefined));
  if (!editor) return null;
  if (editor.kind === "edit" && !inst) return null;
  return <EditorSheet key={editor.kind === "edit" ? editor.instanceId : `new-${editor.date}-${editor.templateId ?? ""}`} onClose={close} inst={inst} />;
}

function EditorSheet({ inst, onClose }: { inst?: CardInstance; onClose: () => void }) {
  const t = useT();
  const editor = useUi((s) => s.editor)!;
  const ws = useApp((s) => s.ws)!;
  const date = useApp((s) => s.date);
  const { createCard, saveCard, act } = useApp.getState();
  const isEdit = !!inst;
  const series = inst?.seriesId ? ws.series.find((s) => s.id === inst.seriesId) : undefined;
  const isRoutineDay = !!series && !inst?.groupId;

  const initialSpec = useMemo<CardSpec>(() => {
    if (inst) return cloneSpec(inst.spec, false);
    if (editor.kind === "create" && editor.templateId) {
      const tpl = ws.templates.find((x) => x.id === editor.templateId);
      if (tpl) return cloneSpec(tpl.spec);
    }
    return newCardSpec();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [spec, setSpec] = useState<CardSpec>(initialSpec);
  const [repeat, setRepeat] = useState<RepeatValue>(ruleToRepeat(series?.rule));
  const [sectionId, setSectionId] = useState<ID | null | undefined>(editor.kind === "create" ? editor.sectionId : undefined);
  const [groupId, setGroupId] = useState<ID | null>(inst?.groupId ?? null);
  const [mode, setMode] = useState<CompletionMode>(inst?.completionMode ?? "together");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [scope, setScope] = useState<"this" | "future">("this");
  const [conflict, setConflict] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [tplName, setTplName] = useState<string | null>(null);

  const targetDate = inst?.date ?? (editor.kind === "create" ? editor.date : date);
  const shareable = ws.groups.filter((g) => canEditRole(roleIn(ws.members, g.id, ws.me.id)));
  const canChangeSharing = !inst || inst.ownerId === ws.me.id;
  const repeating = repeat.kind !== "once";

  // template picking (create only)
  const [picked, setPicked] = useState<string>(editor.kind === "create" ? (editor.templateId ?? "") : "");

  const validate = () => {
    if (!spec.title.trim()) return t("Give the card a title.");
    if (spec.completion.mode === "derived" && spec.completion.blockIds.length === 0) return t("Choose which checklist or target completes this card, or switch to manual completion.");
    if (repeat.kind === "weekdays" && repeat.weekdays.length === 0) return t("Pick at least one day to repeat on.");
    if (repeat.end && repeat.end < targetDate) return t("The end date is before the start date.");
    if (repeating && groupId) return t("Routines are personal. Turn off repeating to share this card.");
    return null;
  };

  const doSave = async (chosen: "this" | "future") => {
    setSaving(true);
    setError(null);
    const clean = { ...spec, title: spec.title.trim() };
    if (!inst) {
      const ok = await createCard({ date: targetDate, spec: clean, sectionId, recurrence: repeatToRule(repeat), groupId, completionMode: mode });
      setSaving(false);
      if (ok) onClose();
      return;
    }
    const r = await saveCard(
      inst,
      {
        spec: clean,
        groupId: canChangeSharing ? groupId : undefined,
        completionMode: groupId ? mode : undefined,
        rule: chosen === "future" && isRoutineDay ? (repeatToRule(repeat) ?? undefined) : undefined,
      },
      chosen,
    );
    setSaving(false);
    if (r.ok) onClose();
    else if (r.conflict) setConflict(true);
  };

  const onSave = () => {
    const err = validate();
    if (err) return setError(err);
    if (isRoutineDay && groupId === inst?.groupId) {
      setScope("this");
      setScopeOpen(true);
    } else void doSave("this");
  };

  return (
    <>
      <Sheet
        open
        full
        onOpenChange={(o) => !o && onClose()}
        wide
        title={isEdit ? t("Edit card") : t("New card")}
        description={isEdit ? `${formatLong(inst!.date)}${isRoutineDay ? " · " + t("part of a routine") : ""}` : formatLong(targetDate)}
        footer={
          <>
            <Button variant="outline" onClick={onClose}>{t("Cancel")}</Button>
            <Button variant="primary" disabled={saving} onClick={onSave} className="min-w-28">{saving ? t("Saving…") : isEdit ? t("Save") : t("Add card")}</Button>
          </>
        }
      >
        <div className="space-y-6">
          {error && <p role="alert" className="rounded-xl border border-danger/60 bg-surface-2 p-3 text-[15px] text-danger">{error}</p>}
          {!isEdit && (
            <Field label={t("Start from")} htmlFor="tpl">
              <select id="tpl" className={inputCls} value={picked} onChange={(e) => { setPicked(e.target.value); const tpl = ws.templates.find((x) => x.id === e.target.value); setSpec(tpl ? cloneSpec(tpl.spec) : newCardSpec()); }}>
                <option value="">{t("Blank card")}</option>
                {ws.templates.map((tpl) => <option key={tpl.id} value={tpl.id}>{tpl.name}{tpl.ownerId ? "" : ` (${t("starter")})`}</option>)}
              </select>
            </Field>
          )}

          <SpecEditor spec={spec} onChange={setSpec} groupId={groupId} />

          <Disclosure title={t("Schedule")} summary={isEdit && !isRoutineDay ? t("One-off") : repeat.kind === "once" ? t("Just once") : repeat.kind === "daily" ? t("Every day") : t("Selected days")}>
            {isEdit && !isRoutineDay ? (
              <p className="text-[15px] text-muted">{inst!.groupId ? t("Shared cards belong to a single day.") : t("This is a one-off card. Use “Move to another day” on the card to reschedule it.")}</p>
            ) : (
              <>
                {isRoutineDay && series && <p className="text-[15px] text-muted">{t("Currently {rule}. Schedule changes apply to this and future occurrences.", { rule: describeRule(series.rule).toLowerCase() })}</p>}
                <RepeatEditor value={repeat} onChange={setRepeat} allowOnce={!isRoutineDay} startLabel={t("Starts {date}.", { date: formatLong(targetDate) })} />
              </>
            )}
            {!isEdit && (
              <Field label={t("Section")} htmlFor="sec">
                <select id="sec" className={inputCls} value={sectionId === undefined ? "auto" : (sectionId ?? "none")} onChange={(e) => setSectionId(e.target.value === "auto" ? undefined : e.target.value === "none" ? null : e.target.value)}>
                  <option value="auto">{t("Automatic (by time)")}</option>
                  <option value="none">{t("Anytime")}</option>
                  {ws.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
            )}
          </Disclosure>

          {canChangeSharing && (
            <Disclosure title={t("Sharing")} summary={groupId ? (ws.groups.find((g) => g.id === groupId)?.name ?? t("Shared")) : t("Private")}>
              {shareable.length === 0 ? (
                <p className="text-[15px] text-muted">{t("Create a group in the Groups tab to share cards.")}</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center">
                    <p className="mr-auto text-sm font-medium text-muted">{t("Share with")}</p>
                    <Help label={t("About sharing")}>{t("Cards are private unless you share them. Shared cards appear for every member, and each person arranges them in their own day. Routines are personal; share a single day’s card instead.")}</Help>
                  </div>
                  <select aria-label={t("Share with group")} className={inputCls} value={groupId ?? ""} disabled={repeating} onChange={(e) => setGroupId(e.target.value || null)}>
                    <option value="">{t("Private (only me)")}</option>
                    {shareable.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                  {repeating && <p className="text-sm text-muted">{t("Turn off repeating to share this card.")}</p>}
                  {groupId && (
                    <div className="space-y-1.5">
                      <p className="text-sm font-medium text-muted">{t("Completion")}</p>
                      <Segmented label={t("Shared completion")} value={mode} onChange={setMode} options={[{ value: "together", label: t("Complete together") }, { value: "individual", label: t("Each person completes") }]} />
                      <p className="text-sm text-muted">{mode === "together" ? t("One shared state for everyone.") : t("Everyone keeps their own progress.")}</p>
                    </div>
                  )}
                </>
              )}
            </Disclosure>
          )}

          <div className="space-y-3">
            {tplName === null ? (
              <Button variant="ghost" className="-ml-3" onClick={() => setTplName(spec.title)}>{t("Save as template…")}</Button>
            ) : (
              <form
                className="flex gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const r = await act((p) => p.saveTemplate(tplName, spec), { done: t("Template saved") });
                  if (r.ok) setTplName(null);
                }}
              >
                <input aria-label={t("Template name")} className={inputCls} value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder={t("Template name")} autoFocus />
                <Button type="submit">{t("Save")}</Button>
                <Button type="button" variant="ghost" onClick={() => setTplName(null)}>{t("Cancel")}</Button>
              </form>
            )}
          </div>

          {isEdit && inst && (inst.ownerId === ws.me.id || canEditRole(roleIn(ws.members, inst.groupId, ws.me.id))) && (
            <section aria-label={t("Danger zone")} className="mt-2 rounded-xl border border-danger/40 p-4">
              <p className="mb-3 text-[15px] text-muted">{t("Removing a card can’t be undone from here.")}</p>
              <Button variant="danger" onClick={() => setDeleteOpen(true)}><Trash2 size={16} aria-hidden /> {t("Delete card…")}</Button>
            </section>
          )}
        </div>
      </Sheet>

      {/* scope prompt for routine edits */}
      <AlertDialog.Root open={scopeOpen} onOpenChange={setScopeOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-[60] bg-black/70" />
          <AlertDialog.Content className="sheet-in fixed left-1/2 top-1/2 z-[70] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-surface p-6 shadow-lg outline-none">
            <AlertDialog.Title className="text-xl font-semibold">{t("Apply this change to…")}</AlertDialog.Title>
            <AlertDialog.Description className="mt-1 text-sm text-muted">{t("This card belongs to a routine. Past days always keep what happened on them.")}</AlertDialog.Description>
            <div role="radiogroup" aria-label={t("Scope of change")} className="mt-4 space-y-2">
              {(
                [
                  ["this", t("This day only"), t("Only {date} changes.", { date: formatLong(inst?.date ?? date) })],
                  ["future", t("This and future occurrences"), t("The routine changes from this day on, including any schedule change.")],
                ] as const
              ).map(([v, label, d]) => (
                <label key={v} className={`flex cursor-pointer gap-3 rounded-2xl border p-3 ${scope === v ? "border-accent bg-surface" : "border-line"}`}>
                  <input type="radio" name="scope" className="mt-1 accent-[var(--color-accent)]" checked={scope === v} onChange={() => setScope(v)} />
                  <span><span className="block font-medium">{label}</span><span className="text-sm text-muted">{d}</span></span>
                </label>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <AlertDialog.Cancel asChild><Button>{t("Back")}</Button></AlertDialog.Cancel>
              <Button variant="primary" onClick={() => { setScopeOpen(false); void doSave(scope); }}>{t("Save")}</Button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      {/* stale edit */}
      <Confirm
        open={conflict}
        onOpenChange={setConflict}
        title={t("This card changed while you were editing")}
        description={t("Someone else saved a newer version, so yours wasn’t applied. You can keep editing and review the latest, or overwrite it with your version.")}
        confirmLabel={t("Overwrite with mine")}
        onConfirm={async () => {
          const latest = useApp.getState().data?.instances.find((i) => i.id === inst!.id);
          if (!latest) return useApp.getState().toast(t("The card no longer exists."), { kind: "error" });
          const r = await saveCard(latest, { spec: { ...spec, title: spec.title.trim() }, groupId: canChangeSharing ? groupId : undefined, completionMode: groupId ? mode : undefined }, "this");
          if (r.ok) onClose();
        }}
      />

      {inst && <DeleteCardDialog open={deleteOpen} onOpenChange={setDeleteOpen} inst={inst} onDone={onClose} />}
    </>
  );
}

export function RoutineDelete({ open, onOpenChange, inst, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; inst: CardInstance; onDone?: () => void }) {
  const t = useT();
  const act = useApp((s) => s.act);
  const [choice, setChoice] = useState<"this" | "future">("this");
  return (
    <Confirm
      open={open}
      onOpenChange={onOpenChange}
      title={t("Remove “{title}”?", { title: inst.spec.title })}
      confirmLabel={choice === "this" ? t("Skip this day") : t("End routine here")}
      description={t("This card belongs to a routine.")}
      onConfirm={async () => {
        const r = await act((p) => p.deleteCard(inst, choice), {
          done: choice === "this" ? t("Skipped for this day") : t("Routine ended"),
          undo: choice === "this" ? () => useApp.getState().planner!.setSkipped(inst.id, inst.date, false) : undefined,
        });
        if (r.ok) onDone?.();
      }}
    >
      <div role="radiogroup" aria-label={t("What to remove")} className="mt-4 space-y-2">
        {(
          [
            ["this", t("Skip this day only"), t("The routine stays. Skipping is not a failure.")],
            ["future", t("End the routine from this day"), t("Removes this and future occurrences. Past days stay as they are.")],
          ] as const
        ).map(([v, label, d]) => (
          <label key={v} className={`flex cursor-pointer gap-3 rounded-2xl border p-3 ${choice === v ? "border-accent bg-surface" : "border-line"}`}>
            <input type="radio" name="del" className="mt-1 accent-[var(--color-accent)]" checked={choice === v} onChange={() => setChoice(v)} />
            <span><span className="block font-medium">{label}</span><span className="text-sm text-muted">{d}</span></span>
          </label>
        ))}
      </div>
    </Confirm>
  );
}

/** Delete flow for any card: routine days offer skip / end-routine; one-offs and shared cards confirm with undo. */
export function DeleteCardDialog({ open, onOpenChange, inst, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; inst: CardInstance; onDone?: () => void }) {
  const t = useT();
  const ws = useApp((s) => s.ws)!;
  const act = useApp((s) => s.act);
  const isRoutineDay = !!inst.seriesId && !inst.groupId && ws.series.some((s) => s.id === inst.seriesId);
  if (isRoutineDay) return <RoutineDelete open={open} onOpenChange={onOpenChange} inst={inst} onDone={onDone} />;
  return (
    <Confirm
      open={open}
      onOpenChange={onOpenChange}
      title={t("Delete “{title}”?", { title: inst.spec.title })}
      description={inst.groupId ? t("This removes the card for everyone in the group, including their progress.") : t("This removes the card and its progress.")}
      onConfirm={async () => {
        const planner = useApp.getState().planner!;
        const progress = (await planner.repo.loadDay(inst.date)).progress.filter((p) => p.instanceId === inst.id);
        const r = await act((p) => p.deleteCard(inst), {
          done: t("Deleted “{title}”", { title: inst.spec.title }),
          undo: async () => {
            await planner.repo.createInstance(inst);
            for (const rec of progress) await planner.repo.patchProgress(inst.id, rec.scope, rec.state);
          },
        });
        if (r.ok) onDone?.();
      }}
    />
  );
}
