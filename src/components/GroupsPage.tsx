"use client";
import { Mail, Plus, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { LocalRepo } from "@/lib/data/local";
import { canManageGroup, roleIn } from "@/lib/domain/permissions";
import type { Group, Role } from "@/lib/domain/types";
import { useApp } from "@/store/app";
import { Page, PageHeader } from "./PageHeader";
import { Button, Confirm, Sheet, inputCls } from "./ui";

export function GroupsPage() {
  const ws = useApp((s) => s.ws);
  const mode = useApp((s) => s.mode);
  const planner = useApp((s) => s.planner);
  const act = useApp((s) => s.act);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [del, setDel] = useState<Group | null>(null);
  const [leave, setLeave] = useState<Group | null>(null);
  if (!ws || !planner) return null;
  const myInvites = ws.invitations.filter((i) => i.status === "pending" && i.email.toLowerCase() === (ws.me.email ?? "").toLowerCase() && i.invitedBy !== ws.me.id);
  const nameOf = (id: string) => ws.profiles.find((p) => p.id === id);

  return (
    <Page>
      <PageHeader title="Groups" subtitle="Share individual cards with family, a partner or friends. Cards stay private until you share them." actions={<Button variant="primary" onClick={() => setCreating(true)}><Plus size={16} aria-hidden /> New group</Button>} />
      {mode === "demo" && (
        <p className="mb-5 rounded-2xl border border-amber/40 bg-amber/10 p-4 text-[15px]">
          <strong>Demo data.</strong> Family, Maja and Erik are sample members stored in this browser. This previews how sharing behaves — real sharing between accounts needs the Supabase backend. You can switch which sample member you are in Settings.
        </p>
      )}
      {myInvites.length > 0 && (
        <section aria-label="Invitations for you" className="mb-5 space-y-2">
          <h2 className="font-serif text-2xl">Invitations for you</h2>
          {myInvites.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber/50 bg-surface p-4">
              <p><Mail size={16} className="mr-2 inline text-amber" aria-hidden />Join <strong>{i.groupName}</strong> as {i.role}</p>
              <span className="flex gap-2"><Button small variant="primary" onClick={() => void act((p) => p.respondInvitation(i.id, true), { done: `Joined ${i.groupName}` })}>Accept</Button><Button small onClick={() => void act((p) => p.respondInvitation(i.id, false))}>Decline</Button></span>
            </div>
          ))}
        </section>
      )}
      {ws.groups.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-line p-10 text-center text-muted">You’re not in any groups yet. Create one to start sharing cards.</p>
      ) : (
        <div className="space-y-5">
          {ws.groups.map((g) => {
            const role = roleIn(ws.members, g.id, ws.me.id);
            const owner = canManageGroup(role);
            const members = ws.members.filter((m) => m.groupId === g.id);
            const pending = ws.invitations.filter((i) => i.groupId === g.id && i.status === "pending" && i.invitedBy === ws.me.id);
            return (
              <section key={g.id} aria-labelledby={`g-${g.id}`} className="rounded-3xl border border-line bg-surface p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 id={`g-${g.id}`} className="flex items-center gap-2 font-serif text-2xl"><Users size={20} className="text-amber" aria-hidden /> {g.name}</h2>
                  <span className="rounded-full bg-surface-2 px-3 py-1 text-sm text-muted">You are {role}</span>
                </div>
                <ul className="mt-3 divide-y divide-line">
                  {members.map((m) => {
                    const p = nameOf(m.userId);
                    return (
                      <li key={m.userId} className="flex min-h-12 items-center justify-between gap-3 py-1">
                        <span>{p?.name ?? "Member"}{m.userId === ws.me.id && " (you)"}{p?.demo && <span className="ml-2 rounded-full border border-amber/50 px-2 py-0.5 text-xs text-amber">demo data</span>}</span>
                        <span className="flex items-center gap-2">
                          {owner && m.role !== "owner" ? (
                            <>
                              <select aria-label={`Role for ${p?.name}`} className="min-h-10 rounded-lg border border-line bg-bg px-2 text-sm" value={m.role} onChange={(e) => void act((pl) => pl.setMemberRole(g.id, m.userId, e.target.value as "editor" | "viewer"))}><option value="editor">Editor</option><option value="viewer">Viewer</option></select>
                              <Button small variant="danger" aria-label={`Remove ${p?.name}`} onClick={() => void act((pl) => pl.removeMember(g.id, m.userId), { done: "Member removed" })}><Trash2 size={14} aria-hidden /></Button>
                            </>
                          ) : <span className="text-sm capitalize text-muted">{m.role}</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-xs text-muted">Owner manages members and the group. Editors edit shared cards. Viewers read them and update their own progress when each person completes.</p>
                {owner && <InviteForm group={g} pending={pending} demo={planner.repo instanceof LocalRepo ? planner.repo : null} />}
                <div className="mt-4 flex justify-end gap-2">
                  {owner ? <Button variant="danger" small onClick={() => setDel(g)}>Delete group…</Button> : <Button variant="danger" small onClick={() => setLeave(g)}>Leave group…</Button>}
                </div>
              </section>
            );
          })}
        </div>
      )}
      <Sheet open={creating} onOpenChange={setCreating} title="New group" footer={<><Button onClick={() => setCreating(false)}>Cancel</Button><Button variant="primary" disabled={!name.trim()} onClick={async () => { const r = await act((p) => p.createGroup(name), { done: "Group created" }); if (r.ok) { setName(""); setCreating(false); } }}>Create</Button></>}>
        <form onSubmit={(e) => e.preventDefault()}><label className="mb-1.5 block text-sm font-medium text-muted" htmlFor="gn">Group name</label><input id="gn" autoFocus className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Family, Partner, Friends…" /></form>
      </Sheet>
      <Confirm open={!!del} onOpenChange={(o) => !o && setDel(null)} title={`Delete “${del?.name}”?`} description="Members lose access. Shared cards become private to whoever created them." onConfirm={() => void act((p) => p.deleteGroup(del!.id), { done: "Group deleted" })} />
      <Confirm open={!!leave} onOpenChange={(o) => !o && setLeave(null)} title={`Leave “${leave?.name}”?`} confirmLabel="Leave" description="Cards you shared go back to being private. You’ll stop seeing the group’s cards." onConfirm={() => void act((p) => p.removeMember(leave!.id, ws.me.id), { done: "You left the group" })} />
    </Page>
  );
}

function InviteForm({ group, pending, demo }: { group: Group; pending: { id: string; email: string; role: string }[]; demo: LocalRepo | null }) {
  const act = useApp((s) => s.act);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<Role, "owner">>("viewer");
  return (
    <div className="mt-4 rounded-2xl border border-line bg-bg/50 p-3">
      <form className="flex flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); const r = await act((p) => p.invite(group.id, email, role), { done: "Invitation created" }); if (r.ok) setEmail(""); }}>
        <input type="email" required aria-label={`Invite by email to ${group.name}`} placeholder="Invite by email" className={`${inputCls} min-w-0 flex-1`} value={email} onChange={(e) => setEmail(e.target.value)} />
        <select aria-label="Role for invitation" className="min-h-11 rounded-xl border border-line bg-bg px-2" value={role} onChange={(e) => setRole(e.target.value as "editor" | "viewer")}><option value="viewer">Viewer</option><option value="editor">Editor</option></select>
        <Button type="submit" variant="primary">Invite</Button>
      </form>
      {pending.length > 0 && (
        <ul className="mt-3 space-y-1">
          {pending.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{i.email} · {i.role} · pending</span>
              <span className="flex gap-2">
                {demo && <Button small onClick={async () => { await demo.simulateAcceptance(i.id); await act(async () => undefined, { done: "Demo: invitation accepted by a simulated person" }); }}>Simulate accept (demo)</Button>}
                <Button small variant="danger" onClick={() => void act((p) => p.revokeInvitation(i.id), { done: "Invitation revoked" })}>Revoke</Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted">Invitations are tied to an email address: only that person, signed in with that address, can accept. You can revoke one any time before it’s accepted.</p>
    </div>
  );
}
