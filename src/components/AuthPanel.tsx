"use client";
import { useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { Button, Field, Segmented, inputCls } from "./ui";

/** Email + password sign-in against Supabase Auth (only rendered when Supabase is configured). */
export function AuthPanel() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const sb = getSupabase()!;
    const res =
      mode === "in"
        ? await sb.auth.signInWithPassword({ email, password })
        : await sb.auth.signUp({ email, password, options: { data: { display_name: name || email.split("@")[0] }, emailRedirectTo: window.location.origin } });
    setBusy(false);
    if (res.error) return setMsg({ kind: "error", text: res.error.message });
    if (mode === "up" && !res.data.session) setMsg({ kind: "info", text: "Check your email to confirm your address, then sign in. Invitations are matched to your confirmed email." });
  }

  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-3xl border border-line bg-surface p-6 shadow-2xl">
        <div>
          <h1 className="font-serif text-4xl text-amber">Dayview</h1>
          <p className="mt-1 text-muted">A calm place for your day.</p>
        </div>
        <Segmented label="Mode" value={mode} onChange={setMode} options={[{ value: "in", label: "Sign in" }, { value: "up", label: "Create account" }]} />
        {mode === "up" && <Field label="Name" htmlFor="n"><input id="n" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>}
        <Field label="Email" htmlFor="e"><input id="e" type="email" required className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
        <Field label="Password" htmlFor="p"><input id="p" type="password" required minLength={8} className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "in" ? "current-password" : "new-password"} /></Field>
        {msg && <p role={msg.kind === "error" ? "alert" : "status"} className={msg.kind === "error" ? "text-sm text-danger" : "text-sm text-muted"}>{msg.text}</p>}
        <Button type="submit" variant="primary" className="w-full" disabled={busy}>{busy ? "One moment…" : mode === "in" ? "Sign in" : "Create account"}</Button>
      </form>
    </main>
  );
}
