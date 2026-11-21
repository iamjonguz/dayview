"use client";
import clsx from "clsx";
import { Check, ChevronDown, ChevronRight, Mail, Plus, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LocalRepo } from "@/lib/data/local";
import { addDays, formatShort, relativeKind, relativeLabel } from "@/lib/domain/dates";
import { canManageGroup, roleIn, scopeFor } from "@/lib/domain/permissions";
import { cardProgress, emptyState } from "@/lib/domain/progress";
import { useT, type TFn } from "@/lib/i18n";
import { dayHref } from "@/lib/ui/links";
import type { CardInstance, Group, ProgressRecord, Role } from "@/lib/domain/types";
import { useApp } from "@/store/app";
import { Page, PageHeader } from "./PageHeader";
import { Button, Confirm, IconButton, Sheet, Spinner, inputCls } from "./ui";

const roleLabel = (t: TFn, r: string | null) => (r === "owner" ? t("owner") : r === "editor" ? t("editor") : r === "viewer" ? t("viewer") : (r ?? ""));

export function GroupsPage() {
  const t = useT();
  const ws = useApp((s) => s.ws);
  const mode = useApp((s) => s.mode);
  const planner = useApp((s) => s.planner);
  const act = useApp((s) => s.act);
  const version = useApp((s) => s.data);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [del, setDel] = useState<Group | null>(null);
  const [leave, setLeave] = useState<Group | null>(null);
  const [shared, setShared] = useState<{ instances: CardInstance[]; progress: ProgressRecord[] } | null>(null);

  useEffect(() => {
    if (!planner) return;
    const day = planner.today();
    let live = true;
    planner.repo.loadRange(day, addDays(day, 7)).then((r) => live && setShared({ instances: r.instances.filter((i) => i.groupId), progress: r.progress }), () => live && setShared({ instances: [], progress: [] }));
    return () => void (live = false);
  }, [planner, version]);

  if (!ws || !planner) return null;
  const today = planner.today();
  const myInvites = ws.invitations.filter((i) => i.status === "pending" && i.email.toLowerCase() === (ws.me.email ?? "").toLowerCase() && i.invitedBy !== ws.me.id);
  const nameOf = (id: string) => ws.profiles.find((p) => p.id === id);
  const sharedRows = (shared?.instances ?? []).filter((i) => !i.skipped).sort((a, b) => a.date.localeCompare(b.date) || (a.spec.time ?? "99").localeCompare(b.spec.time ?? "99"));
  const stateOf = (i: CardInstance) => shared?.progress.find((p) => p.instanceId === i.id && p.scope === scopeFor(i, ws.me.id))?.state ?? emptyState();

  return (
    <Page>
      <PageHeader title={t("Groups")} subtitle={t("Shared activities, and the people you share them with.")} actions={<Button variant="primary" onClick={() => setCreating(true)}><Plus size={18} aria-hidden /> {t("New group")}</Button>} />
      {mode === "demo" ? (
        <details className="mb-5 rounded-xl border border-line bg-surface">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 text-[15px]"><span aria-hidden className="size-1.5 rounded-full bg-accent" /><strong className="whitespace-nowrap font-semibold">{t("Demo data")}</strong><span className="min-w-0 truncate text-muted">· {t("simulated members")}</span><ChevronDown size={16} className="ml-auto text-muted" aria-hidden /></summary>
          <p className="border-t border-line px-4 py-3 text-[15px] text-muted">{t("Family, Maja and Erik are sample members stored in this browser, to preview how shared cards behave. Sharing between real accounts needs the Supabase backend. Switch sample member in Settings.")}</p>
        </details>
      ) : null}

      {myInvites.length > 0 && (
        <section aria-label={t("Invitations for you")} className="mb-5 space-y-2">
          <h2 className="text-lg font-semibold">{t("Invitations for you")}</h2>
          {myInvites.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
              <p className="min-w-0"><Mail size={16} className="mr-2 inline text-accent" aria-hidden />{t("Join {group} as {role}", { group: i.groupName ?? "", role: roleLabel(t, i.role) })}</p>
              <span className="flex gap-2"><Button small variant="primary" onClick={() => void act((p) => p.respondInvitation(i.id, true), { done: t("Joined {group}", { group: i.groupName ?? "" }) })}>{t("Accept")}</Button><Button small onClick={() => void act((p) => p.respondInvitation(i.id, false))}>{t("Decline")}</Button></span>
            </div>
          ))}
        </section>
      )}

      <section aria-labelledby="shared-h" className="mb-7">
        <h2 id="shared-h" className="mb-2 text-lg font-semibold">{t("Shared activities")} <span className="text-[15px] font-normal text-muted">· {t("next 7 days")}</span></h2>
        {!shared ? <Spinner /> : sharedRows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-6 text-center text-[15px] text-muted">{t("Nothing shared yet. Open a card’s editor and choose Sharing to share it with a group.")}</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {sharedRows.map((i) => {
              const done = cardProgress(i.spec, stateOf(i)).complete;
              const g = ws.groups.find((x) => x.id === i.groupId);
              return (
                <li key={i.id}>
                  <Link href={dayHref(i.date, i.id)} className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-surface-2">
                    <span className={clsx("grid size-6 shrink-0 place-items-center rounded-md border-2", done ? "border-done bg-done" : "border-muted")} aria-hidden>{done && <Check size={16} strokeWidth={3.5} className="text-done-ink" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{i.spec.title}<span className="sr-only">{done ? t(", complete") : t(", not complete")}. {t("Open this activity on its day")}</span></span>
                      <span className="block truncate text-[15px] text-muted">{[relativeKind(i.date, today) === "upcoming" ? formatShort(i.date) : relativeLabel(i.date, today), i.spec.time, g?.name, i.completionMode === "together" ? t("complete together") : t("each person")].filter(Boolean).join(" · ")}</span>
                    </span>
                    <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="groups-h">
        <h2 id="groups-h" className="mb-2 text-lg font-semibold">{t("Your groups")}</h2>
        {ws.groups.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-8 text-center text-[15px] text-muted">{t("You’re not in any groups yet. Create one to start sharing cards.")}</p>
        ) : (
          <div className="space-y-2">
            {ws.groups.map((g) => {
              const role = roleIn(ws.members, g.id, ws.me.id);
              const owner = canManageGroup(role);
              const members = ws.members.filter((m) => m.groupId === g.id);
              const pending = ws.invitations.filter((i) => i.groupId === g.id && i.status === "pending" && i.invitedBy === ws.me.id);
              return (
                <details key={g.id} className="group rounded-xl border border-line bg-surface">
                  <summary className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-2">
                    <Users size={18} className="shrink-0 text-muted" aria-hidden />
                    <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{g.name}</span><span className="block text-[15px] text-muted">{members.length === 1 ? t("{n} member", { n: members.length }) : t("{n} members", { n: members.length })} · {t("you’re {role}", { role: roleLabel(t, role) })}</span></span>
                    <span className="hidden text-sm text-muted sm:inline">{t("Manage")}</span>
                    <ChevronDown size={18} className="shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <div className="border-t border-line px-4 pb-4">
                    <ul className="divide-y divide-line">
                      {members.map((m) => {
                        const p = nameOf(m.userId);
                        return (
                          <li key={m.userId} className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1.5">
                            <span className="min-w-0">{p?.name ?? t("Member")}{m.userId === ws.me.id && ` ${t("(you)")}`}{p?.demo && <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-[13px] text-muted">{t("demo")}</span>}</span>
                            <span className="flex items-center gap-2">
                              {owner && m.role !== "owner" ? (
                                <>
                                  <select aria-label={t("Role for {name}", { name: p?.name ?? "" })} className="min-h-11 rounded-lg border border-line bg-bg px-2 text-[15px]" value={m.role} onChange={(e) => void act((pl) => pl.setMemberRole(g.id, m.userId, e.target.value as "editor" | "viewer"))}><option value="editor">{t("Editor")}</option><option value="viewer">{t("Viewer")}</option></select>
                                  <IconButton label={t("Remove {name}", { name: p?.name ?? "" })} variant="danger" onClick={() => void act((pl) => pl.removeMember(g.id, m.userId), { done: t("Member removed") })}><Trash2 size={16} /></IconButton>
                                </>
                              ) : <span className="text-[15px] capitalize text-muted">{roleLabel(t, m.role)}</span>}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="mt-2 text-sm text-muted">{t("Owners manage members. Editors edit shared cards. Viewers read them and update their own progress when each person completes.")}</p>
                    {owner && <InviteForm group={g} pending={pending} demo={planner.repo instanceof LocalRepo ? planner.repo : null} />}
                    <div className="mt-4 border-t border-line pt-3">
                      {owner ? <Button variant="danger" small onClick={() => setDel(g)}>{t("Delete group…")}</Button> : <Button variant="danger" small onClick={() => setLeave(g)}>{t("Leave group…")}</Button>}
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>

      <Sheet open={creating} onOpenChange={setCreating} title={t("New group")} footer={<><Button onClick={() => setCreating(false)}>{t("Cancel")}</Button><Button variant="primary" disabled={!name.trim()} onClick={async () => { const r = await act((p) => p.createGroup(name), { done: t("Group created") }); if (r.ok) { setName(""); setCreating(false); } }}>{t("Create")}</Button></>}>
        <form onSubmit={(e) => e.preventDefault()}><label className="mb-1.5 block text-sm font-medium text-muted" htmlFor="gn">{t("Group name")}</label><input id="gn" autoFocus className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Family, Partner, Friends…")} /></form>
      </Sheet>
      <Confirm open={!!del} onOpenChange={(o) => !o && setDel(null)} title={t("Delete “{name}”?", { name: del?.name ?? "" })} description={t("Members lose access. Shared cards become private to whoever created them.")} onConfirm={() => void act((p) => p.deleteGroup(del!.id), { done: t("Group deleted") })} />
      <Confirm open={!!leave} onOpenChange={(o) => !o && setLeave(null)} title={t("Leave “{name}”?", { name: leave?.name ?? "" })} confirmLabel={t("Leave")} description={t("Cards you shared go back to being private. You’ll stop seeing the group’s cards.")} onConfirm={() => void act((p) => p.removeMember(leave!.id, ws.me.id), { done: t("You left the group") })} />
    </Page>
  );
}

function InviteForm({ group, pending, demo }: { group: Group; pending: { id: string; email: string; role: string }[]; demo: LocalRepo | null }) {
  const t = useT();
  const act = useApp((s) => s.act);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<Role, "owner">>("viewer");
  return (
    <div className="mt-4 rounded-xl border border-line bg-bg/50 p-3">
      <form className="flex flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); const r = await act((p) => p.invite(group.id, email, role), { done: t("Invitation created") }); if (r.ok) setEmail(""); }}>
        <input type="email" required aria-label={t("Invite by email to {name}", { name: group.name })} placeholder={t("Invite by email")} className={`${inputCls} min-w-0 flex-1`} value={email} onChange={(e) => setEmail(e.target.value)} />
        <select aria-label={t("Role for invitation")} className="min-h-11 rounded-xl border border-line bg-bg px-2" value={role} onChange={(e) => setRole(e.target.value as "editor" | "viewer")}><option value="viewer">{t("Viewer")}</option><option value="editor">{t("Editor")}</option></select>
        <Button type="submit" variant="primary">{t("Invite")}</Button>
      </form>
      {pending.length > 0 && (
        <ul className="mt-3 space-y-1">
          {pending.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{i.email} · {roleLabel(t, i.role)} · {t("pending")}</span>
              <span className="flex gap-2">
                {demo && <Button small onClick={async () => { await demo.simulateAcceptance(i.id); await act(async () => undefined, { done: t("Demo: invitation accepted by a simulated person") }); }}>{t("Simulate accept (demo)")}</Button>}
                <Button small variant="danger" onClick={() => void act((p) => p.revokeInvitation(i.id), { done: t("Invitation revoked") })}>{t("Revoke")}</Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted">{t("Invitations are tied to an email address: only that person, signed in with that address, can accept. You can revoke one any time before it’s accepted.")}</p>
    </div>
  );
}
